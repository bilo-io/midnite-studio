import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerSuiteMain, type SuiteMainWindow } from './suite-main';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(win: SuiteMainWindow | null) {
  const dir = mkdtempSync(join(tmpdir(), 'suite-main-'));
  dirs.push(dir);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, raw: unknown) => void>();
  const main = registerSuiteMain({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void listeners.set(c, l) },
    runtimeDirectory: dir,
    getWindow: () => win,
    warn: vi.fn(),
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
