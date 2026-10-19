import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 91 Theme F — the leak test the teardown contract deserves. `browser-service.test.ts`
 * asserts `removeAllListeners` was called once, which is a contract test. This one asserts the
 * *outcome*: after every tab is closed, no per-tab collection holds an entry and every view was
 * detached from its window.
 *
 * Why a vitest and not Playwright: it asserts module state through a seam, no real browser needed.
 * Proof it bites: comment out any `delete` in `closeBrowserTab` and this fails (checked when written).
 */
const { FakeView } = vi.hoisted(() => {
  class FakeContents {
    destroyed = false;
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    loadURL = vi.fn(async () => undefined);
    setWindowOpenHandler = vi.fn();
    getZoomFactor = () => 1;
    isCurrentlyAudible = () => false;
    on(): this {
      return this;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    removeAllListeners = vi.fn();
    close = vi.fn(() => {
      this.destroyed = true;
    });
  }
  class FakeView {
    webContents = new FakeContents();
    setVisible = vi.fn();
    setBounds = vi.fn();
  }
  return { FakeView };
});

import {
  activateBrowserTab,
  closeBrowserTab,
  createBrowserTab,
  resetBrowserServiceForTests,
  runBrowserDiscardSweep,
  setBrowserBounds,
  setBrowserDiscardMs,
  setBrowserKeepAwake,
  trackedStateSizes,
} from './browser-service';
import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserLog } from './browser-main-deps';

const session = () => ({
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setDevicePermissionHandler: vi.fn(),
  setDisplayMediaRequestHandler: vi.fn(),
  on: vi.fn(),
  clearStorageData: vi.fn(async () => undefined),
  clearCache: vi.fn(async () => undefined),
});
const electron = {
  createView: vi.fn(() => new FakeView()),
  sessionFromPartition: vi.fn(() => session()),
  onDisplayMetricsChanged: vi.fn(),
  openExternal: vi.fn(async () => undefined),
};
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;
installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) });

function fakeWindow() {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { send: vi.fn(), isDestroyed: () => false, getZoomFactor: () => 1 },
    on: vi.fn(),
  } as unknown as BrowserHostWindow & { contentView: { removeChildView: ReturnType<typeof vi.fn> } };
}

const EXPECTED_COLLECTIONS = ['tabs', 'lastBounds', 'hiddenSince', 'keepAwakeTabIds', 'visibleTabIds'];

describe('browser-service teardown (leak test)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    vi.clearAllMocks();
  });

  it('tracks exactly the collections this test knows about (a new one must be asserted here)', () => {
    expect(Object.keys(trackedStateSizes()).sort()).toEqual([...EXPECTED_COLLECTIONS].sort());
  });

  it('open 20 tabs, close all 20: every collection is empty and every view was detached', () => {
    const win = fakeWindow();
    const ids = Array.from({ length: 20 }, (_, i) => `tab-${i}`);
    setBrowserDiscardMs(60_000);
    for (const id of ids) {
      createBrowserTab(win, id, 'https://example.com');
      setBrowserBounds(id, { x: 0, y: 0, width: 10, height: 10 });
      setBrowserKeepAwake(id, true);
    }
    activateBrowserTab(ids[0]!); // makes tab-0 visible, hides the rest
    runBrowserDiscardSweep(); // stamps `hiddenSince` for the hidden ones

    const populated = trackedStateSizes();
    expect(populated.tabs).toBe(20);
    expect(populated.lastBounds).toBe(20);
    expect(populated.keepAwakeTabIds).toBe(20);
    expect(populated.visibleTabIds).toBeGreaterThan(0);
    expect(populated.hiddenSince).toBeGreaterThan(0);

    for (const id of ids) closeBrowserTab(id);

    for (const [name, size] of Object.entries(trackedStateSizes())) {
      expect(size, `${name} still holds entries after every tab closed`).toBe(0);
    }
    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(20);
  });
});
