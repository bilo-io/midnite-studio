// vitest (node): the sign-in listing and sign-out over a fake Electron session — no browser needed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANNELS, schemas, WEB_APP_DEFINITIONS, WEB_APP_IDS } from '@midnite/studio-shared';

import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserLog } from './browser-main-deps';
import { listWebAppSignIns, signOutWebApp } from './web-app-sign-ins';
import { registerWebAppsHandlers } from './web-apps-handlers';
import { enableWebApp, resetWebAppsServiceForTests } from './web-apps-service';

/** What a real partition hands back: whole cookies, values included — the code must drop all but the domain. */
const CANARY = 'sp_dc-canary-value-9f3a';
type FakeCookie = { name: string; value: string; domain?: string; path: string; httpOnly: boolean };

function fakeSession(cookies: FakeCookie[]) {
  return {
    cookieJar: cookies,
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    on: vi.fn(),
    clearStorageData: vi.fn(async () => {
      cookies.length = 0;
    }),
    clearCache: vi.fn(async () => undefined),
    cookies: { get: vi.fn(async () => cookies.map((c) => ({ ...c }))) },
  };
}

const sessions = new Map<string, ReturnType<typeof fakeSession>>();
const reload = vi.fn();
const electron = {
  createView: vi.fn(() => ({
    webContents: {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(async () => undefined),
      isDestroyed: () => false,
      reload,
    },
    setVisible: vi.fn(),
    setBounds: vi.fn(),
  })),
  sessionFromPartition: vi.fn((partition: string) => {
    let session = sessions.get(partition);
    if (!session) {
      session = fakeSession([]);
      sessions.set(partition, session);
    }
    return session;
  }),
  onDisplayMetricsChanged: vi.fn(),
  openExternal: vi.fn(async () => undefined),
};
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;

beforeEach(() => {
  installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) });
  resetWebAppsServiceForTests();
  sessions.clear();
  sessions.set(
    WEB_APP_DEFINITIONS.spotify.partition,
    fakeSession([
      { name: 'sp_dc', value: CANARY, domain: '.spotify.com', path: '/', httpOnly: true },
      { name: 'sp_key', value: `${CANARY}-2`, domain: 'open.spotify.com', path: '/', httpOnly: false },
      { name: 'sp_t', value: `${CANARY}-3`, domain: '.spotify.com', path: '/', httpOnly: false },
    ]),
  );
  sessions.set(
    WEB_APP_DEFINITIONS.youtube.partition,
    fakeSession([{ name: 'SID', value: CANARY, domain: '.google.com', path: '/', httpOnly: true }]),
  );
});
afterEach(() => vi.clearAllMocks());

describe('listWebAppSignIns', () => {
  it('lists every web app with its cookie count and the sites they belong to', async () => {
    const result = await listWebAppSignIns();
    expect(result.available).toBe(true);
    expect(result.apps.map((a) => a.id)).toEqual([...WEB_APP_IDS]);
    expect(result.apps.find((a) => a.id === 'spotify')).toEqual({
      id: 'spotify',
      label: 'Spotify',
      partition: 'persist:app-spotify',
      cookieCount: 3,
      origins: ['open.spotify.com', 'spotify.com'],
    });
    expect(result.apps.find((a) => a.id === 'google-calendar')).toMatchObject({ cookieCount: 0, origins: [] });
    expect(result.apps.find((a) => a.id === 'youtube')).toMatchObject({ cookieCount: 1, origins: ['google.com'] });
  });

  it('never carries a cookie value, name or path — the answer is the schema’s fields and nothing else', async () => {
    const result = await listWebAppSignIns();
    const wire = JSON.stringify(result);
    expect(wire).not.toContain(CANARY);
    expect(wire).not.toContain('sp_dc');
    expect(wire).not.toContain('httpOnly');
    // Exactly the schema's keys on every row: nothing rides along that the schema would strip.
    for (const app of result.apps) {
      expect(Object.keys(app).sort()).toEqual(['cookieCount', 'id', 'label', 'origins', 'partition']);
    }
    expect(schemas.WebAppsSignInsResponse.parse(result)).toEqual(result);
  });

  it('reads the partitions under their unchanged names, and clears nothing', async () => {
    await listWebAppSignIns();
    expect(electron.sessionFromPartition.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['persist:app-google-calendar', 'persist:app-spotify', 'persist:app-youtube'],
    );
    for (const session of sessions.values()) {
      expect(session.clearStorageData).not.toHaveBeenCalled();
      expect(session.clearCache).not.toHaveBeenCalled();
    }
  });

  it('answers unavailable, with a sentence, when a partition cannot be read', async () => {
    sessions.get('persist:app-spotify')!.cookies.get.mockRejectedValueOnce(new Error('boom'));
    expect(await listWebAppSignIns()).toEqual({ available: false, reason: expect.any(String), apps: [] });
  });
});

describe('signOutWebApp', () => {
  it('clears exactly that one partition — every other app keeps its sign-in', async () => {
    expect(await signOutWebApp('spotify')).toEqual({ ok: true });
    const spotify = sessions.get('persist:app-spotify')!;
    expect(spotify.clearStorageData).toHaveBeenCalledTimes(1);
    expect(spotify.clearCache).toHaveBeenCalledTimes(1);
    expect(sessions.get('persist:app-youtube')!.clearStorageData).not.toHaveBeenCalled();
    const after = await listWebAppSignIns();
    expect(after.apps.find((a) => a.id === 'spotify')?.cookieCount).toBe(0);
    expect(after.apps.find((a) => a.id === 'youtube')?.cookieCount).toBe(1);
  });

  it('reloads the app’s live view so it shows signed out', async () => {
    const win = {
      isDestroyed: () => false,
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      webContents: { getZoomFactor: () => 1 },
    } as unknown as BrowserHostWindow;
    enableWebApp(win, 'spotify');
    await signOutWebApp('spotify');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('answers a failure as an envelope, not a throw', async () => {
    sessions.get('persist:app-spotify')!.clearStorageData.mockRejectedValueOnce(new Error('locked'));
    expect(await signOutWebApp('spotify')).toEqual({ ok: false, message: expect.stringContaining('locked') });
  });
});

describe('the sign-in channels', () => {
  it('registers both, and a bad id is refused before anything is cleared', async () => {
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const ipc = {
      handle: (channel: string, schema: { safeParse(v: unknown): { success: boolean; data?: unknown; error?: { message: string } } }, fn: (p: unknown) => unknown, onInvalid: (issue: string) => unknown) =>
        void handlers.set(channel, (payload) => {
          const parsed = schema.safeParse(payload);
          return parsed.success ? fn(parsed.data) : onInvalid(parsed.error?.message ?? 'invalid');
        }),
      handleBare: vi.fn(),
      send: vi.fn(),
    };
    registerWebAppsHandlers(ipc, () => null);
    expect(await handlers.get(CHANNELS.webAppsSignIns)?.({})).toMatchObject({ available: true });
    expect(await handlers.get(CHANNELS.webAppsSignOut)?.({ id: 'not-an-app' })).toMatchObject({ ok: false });
    for (const session of sessions.values()) expect(session.clearStorageData).not.toHaveBeenCalled();
  });
});
