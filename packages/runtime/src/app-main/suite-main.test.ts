import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GuardedFetch } from '../net/guarded-fetch';
import { registerSuiteMain, type SuiteMainWindow } from './suite-main';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(win: SuiteMainWindow | null, fetch: GuardedFetch = async () => new Response('', { status: 404 })) {
  const dir = mkdtempSync(join(tmpdir(), 'suite-main-'));
  dirs.push(dir);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, raw: unknown) => void>();
  const main = registerSuiteMain({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void listeners.set(c, l) },
    runtimeDirectory: dir,
    getWindow: () => win,
    warn: vi.fn(),
    app: 'money',
    appVersion: '0.0.7',
    fetch,
  });
  return { main, handlers, listeners };
}

const fakeWindow = (over: Partial<SuiteMainWindow> = {}): SuiteMainWindow => ({
  isFullScreen: () => false,
  isMaximized: () => false,
  isFocused: () => true,
  isDestroyed: () => false,
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  on: vi.fn(),
  setBackgroundColor: vi.fn(),
  webContents: { send: vi.fn() },
  ...over,
});

describe('registerSuiteMain', () => {
  it('answers get with every group and persists a set', async () => {
    const { main, handlers } = setup(null);
    const get = handlers.get(CHANNELS.suitePrefsGet)!;
    const first = (await get({}, undefined)) as { stored: string[] };
    expect(first.stored).toEqual([]);
    const res = (await handlers.get(CHANNELS.suitePrefsSet)!({}, { key: 'terminal', value: { showAllApps: true } })) as { ok: boolean };
    expect(res.ok).toBe(true);
    const after = (await get({}, undefined)) as { stored: string[]; prefs: { terminal: { showAllApps: boolean } } };
    expect(after.stored).toContain('terminal');
    expect(after.prefs.terminal.showAllApps).toBe(true);
    main.close();
  });

  it('rejects an invalid set without throwing', async () => {
    const { main, handlers } = setup(null);
    const res = (await handlers.get(CHANNELS.suitePrefsSet)!({}, { key: 'nope', value: {} })) as { ok: boolean };
    expect(res.ok).toBe(false);
    main.close();
  });

  it('pushes a change to the window', async () => {
    const win = fakeWindow();
    const { main, handlers } = setup(win);
    await handlers.get(CHANNELS.suitePrefsSet)!({}, { key: 'terminal', value: { showAllApps: true } });
    expect(win.webContents.send).toHaveBeenCalledWith(EVENT_CHANNELS.suitePrefsChanged, expect.objectContaining({ stored: ['terminal'] }));
    main.close();
  });

  it('toggles maximise, and does nothing in full screen', () => {
    const win = fakeWindow({ isMaximized: () => true });
    const { main, listeners } = setup(win);
    listeners.get(CHANNELS.windowMaximizeToggle)!({}, undefined);
    expect(win.unmaximize).toHaveBeenCalled();
    const full = fakeWindow({ isFullScreen: () => true });
    const second = setup(full);
    second.listeners.get(CHANNELS.windowMaximizeToggle)!({}, undefined);
    expect(full.maximize).not.toHaveBeenCalled();
    main.close();
    second.main.close();
  });

  it('retints the window for a hex colour only', () => {
    const win = fakeWindow();
    const { main, listeners } = setup(win);
    listeners.get(CHANNELS.windowSetBackground)!({}, '#112233');
    listeners.get(CHANNELS.windowSetBackground)!({}, 'red');
    expect(win.setBackgroundColor).toHaveBeenCalledTimes(1);
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#112233');
    main.close();
  });

  it('attachWindow forwards chrome events', () => {
    const win = fakeWindow();
    const { main } = setup(win);
    main.attachWindow(win);
    expect(win.on).toHaveBeenCalledWith('enter-full-screen', expect.any(Function));
    main.close();
  });
});

describe('registerSuiteMain: release notes', () => {
  it('answers the app’s own notes through the injected fetch', async () => {
    const fetch = vi.fn<GuardedFetch>(async () => new Response('## [0.0.7] - 2026-11-20\n\n- Seventh.\n', { status: 200 }));
    const { main, handlers } = setup(null, fetch);
    const res = (await handlers.get(CHANNELS.suiteReleaseNotes)!({}, { latest: 4 })) as { version: string; notes: string | null };
    expect(res.version).toBe('0.0.7');
    expect(res.notes).toContain('Seventh.');
    expect(String(fetch.mock.calls[0]?.[1])).toContain('midnite-money/CHANGELOG.md');
    main.close();
  });

  it('answers an empty request, and registers the channel once', async () => {
    const fetch = vi.fn<GuardedFetch>(async () => new Response('', { status: 404 }));
    const handle = vi.fn();
    const dir = mkdtempSync(join(tmpdir(), 'suite-main-'));
    dirs.push(dir);
    const main = registerSuiteMain({ ipcMain: { handle, on: vi.fn() }, runtimeDirectory: dir, getWindow: () => null, warn: vi.fn(), app: 'money', appVersion: '0.0.7', fetch });
    expect(handle.mock.calls.filter(([c]) => c === CHANNELS.suiteReleaseNotes)).toHaveLength(1);
    const handler = handle.mock.calls.find(([c]) => c === CHANNELS.suiteReleaseNotes)![1] as (e: unknown, raw: unknown) => Promise<{ notes: string | null }>;
    expect((await handler({}, undefined)).notes).toBeNull();
    main.close();
  });

  it('answers an invalid request without fetching', async () => {
    const fetch = vi.fn<GuardedFetch>();
    const { main, handlers } = setup(null, fetch);
    const res = await handlers.get(CHANNELS.suiteReleaseNotes)!({}, { latest: 99 });
    expect(res).toEqual({ version: '0.0.7', notes: null, error: 'invalid request' });
    expect(fetch).not.toHaveBeenCalled();
    main.close();
  });
});

describe('registerSuiteMain: launcher link landing', () => {
  const link = (qs: string) => `--midnite-link=midnite://open?${qs}`;
  const setupWith = (win: SuiteMainWindow | null, argv: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-main-'));
    dirs.push(dir);
    const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
    const main = registerSuiteMain({
      ipcMain: { handle: (c, l) => void handlers.set(c, l), on: vi.fn() },
      runtimeDirectory: dir,
      getWindow: () => win,
      warn: vi.fn(),
      app: 'money',
      appVersion: '0.0.7',
      argv,
    });
    return { main, take: handlers.get(CHANNELS.suiteLinkTake)! };
  };

  it('hands a cold-start argv link to the renderer once', async () => {
    const { main, take } = setupWith(null, ['electron', link('app=agents&module=coder&view=reviews')]);
    expect(await take({}, undefined)).toEqual({ module: 'coder', view: 'reviews' });
    expect(await take({}, undefined)).toBeNull();
    main.close();
  });

  it('answers null when the argv has no link, or one that names nothing to land on', async () => {
    const a = setupWith(null, ['electron']);
    expect(await a.take({}, undefined)).toBeNull();
    a.main.close();
    const b = setupWith(null, ['electron', link('app=agents')]);
    expect(await b.take({}, undefined)).toBeNull();
    b.main.close();
  });

  it('parks a second-instance link until the renderer has mounted, then pushes', async () => {
    const win = fakeWindow();
    const { main, take } = setupWith(win, ['electron']);
    main.handleArgv(['electron', link('app=agents&module=creator')]);
    expect(win.webContents.send).not.toHaveBeenCalledWith(EVENT_CHANNELS.suiteLinkOpen, expect.anything());
    expect(await take({}, undefined)).toEqual({ module: 'creator' });
    main.handleArgv(['electron', link('app=agents&view=chats')]);
    expect(win.webContents.send).toHaveBeenCalledWith(EVENT_CHANNELS.suiteLinkOpen, { view: 'chats' });
    main.close();
  });

  it('ignores a second-instance argv that carries no valid link', async () => {
    const win = fakeWindow();
    const { main, take } = setupWith(win, ['electron']);
    await take({}, undefined);
    main.handleArgv(['electron', '--midnite-link=https://evil.example/', '--midnite-link=not a url']);
    expect(win.webContents.send).not.toHaveBeenCalledWith(EVENT_CHANNELS.suiteLinkOpen, expect.anything());
    main.close();
  });

  it('parks a link again when a new window is attached, until that renderer has taken', async () => {
    const win = fakeWindow();
    const { main, take } = setupWith(win, ['electron']);
    await take({}, undefined);
    main.attachWindow(win);
    main.handleArgv(['electron', link('app=agents&module=coder')]);
    expect(win.webContents.send).not.toHaveBeenCalledWith(EVENT_CHANNELS.suiteLinkOpen, expect.anything());
    expect(await take({}, undefined)).toEqual({ module: 'coder' });
    main.close();
  });
});
