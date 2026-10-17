import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Same arrangement `forge-project-handlers.test.ts` uses: `ipcMain.on`/`.handle`
  are captured so each registered handler can be invoked directly, with the
  rest of the module graph mocked at the seams `browser-handlers.ts` actually
  depends on.
*/
const onHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
const invokeHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      onHandlers.set(channel, fn);
    }),
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      invokeHandlers.set(channel, fn);
    }),
  },
}));

const { setBrowserBounds, setBrowserVisible, ownerWindowForBrowserTab } = vi.hoisted(() => ({
  setBrowserBounds: vi.fn(),
  setBrowserVisible: vi.fn(),
  ownerWindowForBrowserTab: vi.fn(),
}));
vi.mock('../browser-service', () => ({
  activateBrowserTab: vi.fn(),
  backBrowserTab: vi.fn(),
  clearBrowserData: vi.fn(),
  closeBrowserTab: vi.fn(),
  createBrowserTab: vi.fn(),
  findInBrowserTab: vi.fn(),
  forwardBrowserTab: vi.fn(),
  navigateBrowserTab: vi.fn(),
  ownerWindowForBrowserTab,
  reloadBrowserTab: vi.fn(),
  setBrowserBounds,
  setBrowserVisible,
  setBrowserZoom: vi.fn(),
  stopBrowserTab: vi.fn(),
  stopFindInBrowserTab: vi.fn(),
  toggleBrowserDevTools: vi.fn(),
}));

const { resolveWindow } = vi.hoisted(() => ({ resolveWindow: vi.fn() }));
vi.mock('../window-manager', () => ({ resolveWindow }));

vi.mock('../dev-server-probe', () => ({ probeLoopbackPort: vi.fn() }));

const windowA = { id: 'a' };
const windowB = { id: 'b' };

async function loadHandlers(): Promise<void> {
  const { registerBrowserHandlers } = await import('./browser-handlers');
  registerBrowserHandlers();
}

describe('browserSetBounds/browserSetVisible sender scoping (Theme E)', () => {
  beforeEach(async () => {
    onHandlers.clear();
    invokeHandlers.clear();
    vi.clearAllMocks();
    await loadHandlers();
  });
  afterEach(() => vi.clearAllMocks());

  it('applies a bounds push whose sender is the tab\'s owning window', () => {
    ownerWindowForBrowserTab.mockReturnValue(windowA);
    resolveWindow.mockReturnValue(windowA);

    onHandlers.get('mstudio:browser:set-bounds')?.(
      { sender: {} },
      { tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    );

    expect(setBrowserBounds).toHaveBeenCalledWith('tab-1', { x: 0, y: 0, width: 10, height: 10 });
  });

  it('drops a bounds push from a window that no longer owns the tab (a stale push mid-reparent)', () => {
    ownerWindowForBrowserTab.mockReturnValue(windowB);
    resolveWindow.mockReturnValue(windowA);

    onHandlers.get('mstudio:browser:set-bounds')?.(
      { sender: {} },
      { tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    );

    expect(setBrowserBounds).not.toHaveBeenCalled();
  });

  it('drops a setVisible push from a non-owning window the same way', () => {
    ownerWindowForBrowserTab.mockReturnValue(windowB);
    resolveWindow.mockReturnValue(windowA);

    onHandlers.get('mstudio:browser:set-visible')?.({ sender: {} }, { tabId: 'tab-1', visible: true });

    expect(setBrowserVisible).not.toHaveBeenCalled();
  });

  it('applies the push when the tab has no known owner yet (not yet created)', () => {
    ownerWindowForBrowserTab.mockReturnValue(null);
    resolveWindow.mockReturnValue(windowA);

    onHandlers.get('mstudio:browser:set-bounds')?.(
      { sender: {} },
      { tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    );

    expect(setBrowserBounds).toHaveBeenCalledWith('tab-1', { x: 0, y: 0, width: 10, height: 10 });
  });
});
