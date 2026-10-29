import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  attachWindowChrome,
  suiteWindowOptions,
  toggleMaximize,
  TRAFFIC_LIGHT_POSITION,
  windowFrameless,
  type ChromeableWindow,
} from './suite-window';

function fakeWindow(initial: { maximized?: boolean; fullScreen?: boolean; focused?: boolean; destroyed?: boolean } = {}) {
  const state = { maximized: false, fullScreen: false, focused: true, destroyed: false, ...initial };
  const handlers = new Map<string, () => void>();
  const send = vi.fn();
  const win: ChromeableWindow = {
    isFullScreen: () => state.fullScreen,
    isMaximized: () => state.maximized,
    isFocused: () => state.focused,
    isDestroyed: () => state.destroyed,
    maximize: vi.fn(() => {
      state.maximized = true;
    }),
    unmaximize: vi.fn(() => {
      state.maximized = false;
    }),
    on: (event, fn) => {
      handlers.set(event, fn);
    },
    webContents: { send },
  };
  return { win, state, send, emit: (e: string) => handlers.get(e)!() };
}

describe('suiteWindowOptions', () => {
  it('is frameless with inset traffic lights on darwin', () => {
    expect(windowFrameless('darwin')).toBe(true);
    expect(suiteWindowOptions('darwin')).toEqual({
      titleBarStyle: 'hidden',
      trafficLightPosition: TRAFFIC_LIGHT_POSITION,
      additionalArguments: ['--mstudio-frameless=1'],
    });
  });

  it('keeps the native frame elsewhere and says so', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(windowFrameless(platform)).toBe(false);
      expect(suiteWindowOptions(platform)).toEqual({ additionalArguments: ['--mstudio-frameless=0'] });
    }
  });

  it('sets none of the security options', () => {
    const keys = Object.keys(suiteWindowOptions('darwin'));
    expect(keys.sort()).toEqual(['additionalArguments', 'titleBarStyle', 'trafficLightPosition']);
  });
});

describe('attachWindowChrome', () => {
  it('pushes full-screen transitions with their own value', () => {
    const { win, send, emit } = fakeWindow();
    attachWindowChrome(win);
    emit('enter-full-screen');
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.windowStateChanged, {
      maximized: false,
      fullScreen: true,
      focused: true,
    });
    emit('leave-full-screen');
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.windowStateChanged, expect.objectContaining({ fullScreen: false }));
  });

  it('pushes the live state on focus, blur and maximize', () => {
    const { win, state, send, emit } = fakeWindow();
    attachWindowChrome(win);
    state.focused = false;
    emit('blur');
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.windowStateChanged, expect.objectContaining({ focused: false }));
    state.maximized = true;
    emit('maximize');
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.windowStateChanged, expect.objectContaining({ maximized: true }));
  });

  it('sends nothing to a destroyed window', () => {
    const { win, send, emit } = fakeWindow({ destroyed: true });
    attachWindowChrome(win);
    emit('focus');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('toggleMaximize', () => {
  it('is a no-op in full screen', () => {
    const { win } = fakeWindow({ fullScreen: true });
    toggleMaximize(win);
    expect(win.maximize).not.toHaveBeenCalled();
    expect(win.unmaximize).not.toHaveBeenCalled();
  });

  it('unmaximises a maximised window and maximises otherwise', () => {
    const a = fakeWindow({ maximized: true });
    toggleMaximize(a.win);
    expect(a.win.unmaximize).toHaveBeenCalled();
    const b = fakeWindow();
    toggleMaximize(b.win);
    expect(b.win.maximize).toHaveBeenCalled();
  });
});
