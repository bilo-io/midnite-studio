import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 91 Theme F: Phase 84's visibility gate is what stops background work when nothing is on
 * screen. The schedulers' own tests (`fetch-scheduler.test.ts` asserts a closed gate runs no fetch) feed it a fake; this one drives the real gate with fake
 * windows and asserts it reports "stopped" for every hidden shape.
 */
const { windows, getSystemIdleState } = vi.hoisted(() => ({
  windows: [] as Array<{ isDestroyed: () => boolean; isVisible: () => boolean; isMinimized: () => boolean }>,
  getSystemIdleState: vi.fn(() => 'active'),
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows },
  powerMonitor: { getSystemIdleState },
}));

import { IDLE_THRESHOLD_S, anyWindowVisible, systemIdleState } from './window-visibility-gate';

const win = (over: Partial<{ destroyed: boolean; visible: boolean; minimized: boolean }> = {}) => ({
  isDestroyed: () => over.destroyed ?? false,
  isVisible: () => over.visible ?? true,
  isMinimized: () => over.minimized ?? false,
});

describe('window visibility gate', () => {
  beforeEach(() => {
    windows.length = 0;
    getSystemIdleState.mockClear();
  });

  it('reports visible for one on-screen window', () => {
    windows.push(win());
    expect(anyWindowVisible()).toBe(true);
  });

  it('reports stopped when there are no windows, or every window is hidden, minimized or destroyed', () => {
    expect(anyWindowVisible()).toBe(false);
    windows.push(win({ visible: false }), win({ minimized: true }), win({ destroyed: true }));
    expect(anyWindowVisible()).toBe(false);
  });

  it('asks the OS about idleness at the one shared threshold', () => {
    systemIdleState();
    expect(getSystemIdleState).toHaveBeenCalledWith(IDLE_THRESHOLD_S);
  });
});
