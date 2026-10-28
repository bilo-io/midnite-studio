import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  The handlers register through the runtime's `RuntimeIpc` and the feature's own
  `BrowserSenderIpc` (Phase 113 Theme L), so each registered handler is captured
  from fakes of those two ports and invoked directly — the composer resolves the
  sending window, so a test hands it in. The services are mocked at the seam
  `browser-handlers.ts` actually depends on, as before.
*/
type SenderHandler = (payload: unknown, win: unknown) => unknown;
const onHandlers = new Map<string, SenderHandler>();
const invokeHandlers = new Map<string, SenderHandler>();
const ipc = {
  handle: vi.fn((channel: string, schema: { parse(v: unknown): unknown }, fn: (p: unknown) => unknown) => {
    invokeHandlers.set(channel, (payload) => fn(schema.parse(payload)));
  }),
  handleBare: vi.fn((channel: string, fn: () => unknown) => {
    invokeHandlers.set(channel, () => fn());
  }),
  send: vi.fn((channel: string, schema: { parse(v: unknown): unknown }, fn: (p: unknown) => void) => {
    onHandlers.set(channel, (payload) => fn(schema.parse(payload)));
  }),
};
const sender = {
  handleFromSender: vi.fn(
    (channel: string, schema: { parse(v: unknown): unknown }, fn: (p: unknown, win: unknown) => unknown) => {
      invokeHandlers.set(channel, (payload, win) => fn(schema.parse(payload), win));
    },
  ),
  sendFromSender: vi.fn(
    (channel: string, schema: { parse(v: unknown): unknown }, fn: (p: unknown, win: unknown) => void) => {
      onHandlers.set(channel, (payload, win) => fn(schema.parse(payload), win));
    },
  ),
};

const { setBrowserBounds, setBrowserVisible, ownerWindowForBrowserTab } = vi.hoisted(() => ({
  setBrowserBounds: vi.fn(),
  setBrowserVisible: vi.fn(),
  ownerWindowForBrowserTab: vi.fn(),
}));
vi.mock('./browser-service', () => ({
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
  listBrowserPermissions: vi.fn(() => []),
  resolveBrowserPermission: vi.fn(),
  revokeBrowserPermission: vi.fn(),
  resetAllBrowserPermissions: vi.fn(),
  setBrowserSpellcheck: vi.fn(),
}));

vi.mock('./dev-server-probe', () => ({ probeLoopbackPort: vi.fn() }));

const windowA = { id: 'a' };
const windowB = { id: 'b' };

async function loadHandlers(): Promise<void> {
  const { registerBrowserHandlers } = await import('./browser-handlers');
  registerBrowserHandlers(ipc as never, sender as never);
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

    onHandlers.get('mstudio:browser:set-bounds')?.({ tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } }, windowA);

    expect(setBrowserBounds).toHaveBeenCalledWith('tab-1', { x: 0, y: 0, width: 10, height: 10 });
  });

  it('drops a bounds push from a window that no longer owns the tab (a stale push mid-reparent)', () => {
    ownerWindowForBrowserTab.mockReturnValue(windowB);

    onHandlers.get('mstudio:browser:set-bounds')?.({ tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } }, windowA);

    expect(setBrowserBounds).not.toHaveBeenCalled();
  });

  it('drops a setVisible push from a non-owning window the same way', () => {
    ownerWindowForBrowserTab.mockReturnValue(windowB);

    onHandlers.get('mstudio:browser:set-visible')?.({ tabId: 'tab-1', visible: true }, windowA);

    expect(setBrowserVisible).not.toHaveBeenCalled();
  });

  it('applies the push when the tab has no known owner yet (not yet created)', () => {
    ownerWindowForBrowserTab.mockReturnValue(null);

    onHandlers.get('mstudio:browser:set-bounds')?.({ tabId: 'tab-1', bounds: { x: 0, y: 0, width: 10, height: 10 } }, windowA);

    expect(setBrowserBounds).toHaveBeenCalledWith('tab-1', { x: 0, y: 0, width: 10, height: 10 });
  });
});
