// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain and a faked Electron.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserManifest, type BrowserElectron, type BrowserHostWindow } from '@midnite/studio-feature-browser/main';
import { reportManifest } from '@midnite/studio-feature-report/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerBrowserAppHandlers } from './context';

/** A `WebContentsView` with just the surface `browser-service.ts` touches. */
class FakeView {
  options: Record<string, unknown>;
  bounds: unknown = null;
  setVisible = vi.fn();
  setBounds = vi.fn((b: unknown) => {
    this.bounds = b;
  });
  webContents = {
    destroyed: false,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() },
    loadURL: vi.fn(async () => undefined),
    setWindowOpenHandler: vi.fn(),
    getZoomFactor: () => 1,
    setZoomFactor: vi.fn(),
    isCurrentlyAudible: () => false,
    on: vi.fn(),
    isDestroyed: () => false,
    removeAllListeners: vi.fn(),
    close: vi.fn(),
  };
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
}

function fakeSession() {
  return {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    on: vi.fn(),
    clearStorageData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
  };
}

function fakeWindow(): BrowserHostWindow {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { send: vi.fn(), isDestroyed: () => false, getZoomFactor: () => 1 },
    on: vi.fn(),
  } as unknown as BrowserHostWindow;
}

function setup() {
  const handles = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const ons = new Map<string, (event: unknown, raw: unknown) => void>();
  const views: FakeView[] = [];
  const sessions = new Map<string, ReturnType<typeof fakeSession>>();
  const electron = {
    createView: vi.fn((options: Record<string, unknown>) => {
      const view = new FakeView(options);
      views.push(view);
      return view;
    }),
    sessionFromPartition: vi.fn((partition: string) => {
      const existing = sessions.get(partition) ?? fakeSession();
      sessions.set(partition, existing);
      return existing;
    }),
    onDisplayMetricsChanged: vi.fn(),
    openExternal: vi.fn(async () => undefined),
  };
  const main = fakeWindow();
  const other = fakeWindow();
  const windowsBySender = new Map<unknown, BrowserHostWindow>([
    ['main-sender', main],
    ['other-sender', other],
  ]);
  const writeClipboard = vi.fn();
  const registered = registerBrowserAppHandlers({
    ipcMain: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: (channel, listener) => ons.set(channel, listener),
    },
    report: { sink: () => null, homeDir: () => '/home', openExternal: () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    trashItem: async () => undefined,
    send: vi.fn(),
    electron: electron as unknown as BrowserElectron,
    getMainWindow: () => main,
    senderWindow: (event) => windowsBySender.get((event as { sender?: unknown }).sender) ?? null,
    writeClipboard,
    log: Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }),
  });
  return { handles, ons, views, sessions, electron, main, other, writeClipboard, registered };
}

let shutdown: (() => void) | null = null;
afterEach(() => {
  shutdown?.();
  shutdown = null;
});

describe('registerBrowserAppHandlers', () => {
  it('registers exactly the browser feature’s channels and the clipboard — nothing else', () => {
    const s = setup();
    shutdown = s.registered.shutdown;
    expect([...s.handles.keys()].sort()).toEqual([...browserManifest.ipc, ...reportManifest.ipc, CHANNELS.clipboardWriteText].sort());
    expect([...s.ons.keys()].sort()).toEqual([...browserManifest.sends, ...reportManifest.sends].sort());
  });

  it('opens a tab in the window that asked, as a sandboxed, preload-free view on persist:browser with every permission denied', async () => {
    const s = setup();
    shutdown = s.registered.shutdown;
    const create = s.handles.get(CHANNELS.browserCreate)!;
    await expect(create({ sender: 'main-sender' }, { tabId: 't1', url: 'https://example.com/' })).resolves.toEqual({ ok: true });
    const view = s.views[0]!;
    expect(view.options).toMatchObject({ webPreferences: { partition: 'persist:browser', sandbox: true, contextIsolation: true, nodeIntegration: false } });
    expect((view.options['webPreferences'] as Record<string, unknown>)['preload']).toBeUndefined();
    expect(vi.mocked(s.main.contentView.addChildView)).toHaveBeenCalledWith(view);
    const partition = s.sessions.get('persist:browser')!;
    expect(partition.setPermissionRequestHandler).toHaveBeenCalled();
    const deny = partition.setPermissionRequestHandler.mock.calls[0]![0] as (wc: unknown, p: string, cb: (ok: boolean) => void) => void;
    const answer = vi.fn();
    deny(null, 'media', answer);
    expect(answer).toHaveBeenCalledWith(false);
  });

  it('refuses a create whose sender has no window, and an invalid payload, without throwing', async () => {
    const s = setup();
    shutdown = s.registered.shutdown;
    const create = s.handles.get(CHANNELS.browserCreate)!;
    await expect(create({ sender: 'unknown' }, { tabId: 't1', url: 'https://example.com/' })).resolves.toMatchObject({ ok: false });
    await expect(create({ sender: 'main-sender' }, { tabId: 42 })).resolves.toMatchObject({ ok: false });
    expect(s.views).toHaveLength(0);
  });

  it('drops a bounds push from a window that does not own the tab', async () => {
    const s = setup();
    shutdown = s.registered.shutdown;
    await s.handles.get(CHANNELS.browserCreate)!({ sender: 'main-sender' }, { tabId: 't1', url: 'https://example.com/' });
    const setBounds = s.ons.get(CHANNELS.browserSetBounds)!;
    const bounds = { x: 0, y: 40, width: 800, height: 600 };
    setBounds({ sender: 'other-sender' }, { tabId: 't1', bounds });
    expect(s.views[0]!.bounds).toBeNull();
    setBounds({ sender: 'main-sender' }, { tabId: 't1', bounds });
    expect(s.views[0]!.bounds).toEqual(bounds);
  });

  it('writes the clipboard, and reports a refused write instead of claiming it copied', async () => {
    const s = setup();
    shutdown = s.registered.shutdown;
    const write = s.handles.get(CHANNELS.clipboardWriteText)!;
    await expect(write({}, { text: 'https://example.com/' })).resolves.toEqual({ ok: true });
    expect(s.writeClipboard).toHaveBeenCalledWith('https://example.com/');
    s.writeClipboard.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    await expect(write({}, { text: 'x' })).resolves.toEqual({ ok: false, message: 'locked' });
  });

  it('tears every view down on shutdown', async () => {
    const s = setup();
    await s.handles.get(CHANNELS.browserCreate)!({ sender: 'main-sender' }, { tabId: 't1', url: 'https://example.com/' });
    s.registered.shutdown();
    expect(s.views[0]!.webContents.close).toHaveBeenCalled();
  });
});
