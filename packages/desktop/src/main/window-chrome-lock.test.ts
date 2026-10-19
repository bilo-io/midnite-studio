import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Phase 91 Theme D: the reload IPC is refused while the screen is locked. */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, win: unknown) => void>(),
}));

vi.mock('electron', () => ({ BrowserWindow: class {}, app: {} }));
vi.mock('./log', () => ({ defaultLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('./ipc/handle', () => ({
  handleSendFromSender: (channel: string, _schema: unknown, fn: (p: unknown, w: unknown) => void) => {
    handlers.set(channel, fn);
  },
  handleBareFromSender: (channel: string, fn: (p: unknown, w: unknown) => void) => {
    handlers.set(channel, fn);
  },
}));

import { CHANNELS } from '@midnite/studio-shared';

import { setScreenLocked } from './lock-state';
import { registerWindowChrome } from './window-chrome';

function fakeWin() {
  return {
    isDestroyed: () => false,
    webContents: { reload: vi.fn(), reloadIgnoringCache: vi.fn() },
  };
}

describe('window reload while locked', () => {
  beforeEach(() => {
    handlers.clear();
    registerWindowChrome();
    setScreenLocked(false);
  });

  it('reloads when unlocked', () => {
    const win = fakeWin();
    handlers.get(CHANNELS.windowReload)?.(false, win);
    handlers.get(CHANNELS.windowReload)?.(true, win);
    expect(win.webContents.reload).toHaveBeenCalledTimes(1);
    expect(win.webContents.reloadIgnoringCache).toHaveBeenCalledTimes(1);
  });

  it('refuses plain and hard reload while locked', () => {
    const win = fakeWin();
    setScreenLocked(true);
    handlers.get(CHANNELS.windowReload)?.(false, win);
    handlers.get(CHANNELS.windowReload)?.(true, win);
    expect(win.webContents.reload).not.toHaveBeenCalled();
    expect(win.webContents.reloadIgnoringCache).not.toHaveBeenCalled();
    setScreenLocked(false);
  });
});
