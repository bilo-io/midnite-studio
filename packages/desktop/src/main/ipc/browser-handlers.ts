import { ipcMain, type IpcMainEvent } from 'electron';

import { CHANNELS, ok, schemas } from '@midnite/studio-shared';

import {
  activateBrowserTab,
  backBrowserTab,
  clearBrowserData,
  closeBrowserTab,
  createBrowserTab,
  findInBrowserTab,
  forwardBrowserTab,
  navigateBrowserTab,
  ownerWindowForBrowserTab,
  reloadBrowserTab,
  setBrowserBounds,
  setBrowserDiscardMs,
  setBrowserKeepAwake,
  setBrowserVisible,
  setBrowserZoom,
  stopBrowserTab,
  stopFindInBrowserTab,
  toggleBrowserDevTools,
} from '../browser-service';
import { probeLoopbackPort } from '../dev-server-probe';
import { resolveWindow } from '../window-manager';
import { handle, handleBare, handleFromSender } from './handle';

/**
 * Drops a bounds/visibility push whose sender is not the tab's current
 * owning window (Theme E) — with the browser detached into its own popout
 * (`detached-root.tsx`), both renderers can hold a live `useBrowserBounds`
 * for the same `tabId`, and a stale push from the window that no longer
 * hosts it (mid-reparent) is expected, not an error. `null` (tab not
 * created yet, or its owner can't be resolved) is not treated as a mismatch
 * — the underlying service functions are themselves no-ops for an untracked
 * tab.
 */
export function isFromOwningWindow(event: IpcMainEvent, tabId: string): boolean {
  const owner = ownerWindowForBrowserTab(tabId);
  return owner === null || resolveWindow(event.sender) === owner;
}

/**
 * Registers the `mstudio:browser:*` channels over `browser-service.ts`.
 *
 * `create` is the one request/response call (the renderer needs to know a
 * view failed to spin up); everything else is a one-way `ipcMain.on`, same
 * as `pty.input`/`pty.resize` — a bounds update fires every animation frame
 * while dragging, and a round-trip would only add latency to typing a URL.
 *
 * `create` is sender-resolved (Phase 55), not bound to the main window: a
 * `Mod+t` fired inside the browser popout must attach its new tab to that
 * window, not silently open it back in main.
 */
export function registerBrowserHandlers(): void {
  handleFromSender(
    CHANNELS.browserCreate,
    schemas.BrowserCreateRequest,
    async ({ tabId, url }, win) => {
      if (!win) return { ok: false as const, message: 'No window' };
      createBrowserTab(win, tabId, url);
      return { ok: true as const };
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipcMain.on(CHANNELS.browserClose, (_event, raw: unknown) => {
    const parsed = schemas.BrowserCloseRequest.safeParse(raw);
    if (parsed.success) closeBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserNavigate, (_event, raw: unknown) => {
    const parsed = schemas.BrowserNavigateRequest.safeParse(raw);
    if (parsed.success) navigateBrowserTab(parsed.data.tabId, parsed.data.url);
  });

  ipcMain.on(CHANNELS.browserBack, (_event, raw: unknown) => {
    const parsed = schemas.BrowserBackRequest.safeParse(raw);
    if (parsed.success) backBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserForward, (_event, raw: unknown) => {
    const parsed = schemas.BrowserForwardRequest.safeParse(raw);
    if (parsed.success) forwardBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserReload, (_event, raw: unknown) => {
    const parsed = schemas.BrowserReloadRequest.safeParse(raw);
    if (parsed.success) reloadBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserStop, (_event, raw: unknown) => {
    const parsed = schemas.BrowserStopRequest.safeParse(raw);
    if (parsed.success) stopBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserSetBounds, (event, raw: unknown) => {
    const parsed = schemas.BrowserSetBoundsRequest.safeParse(raw);
    if (parsed.success && isFromOwningWindow(event, parsed.data.tabId)) {
      setBrowserBounds(parsed.data.tabId, parsed.data.bounds);
    }
  });

  ipcMain.on(CHANNELS.browserSetVisible, (event, raw: unknown) => {
    const parsed = schemas.BrowserSetVisibleRequest.safeParse(raw);
    if (parsed.success && isFromOwningWindow(event, parsed.data.tabId)) {
      setBrowserVisible(parsed.data.tabId, parsed.data.visible);
    }
  });

  ipcMain.on(CHANNELS.browserActivate, (_event, raw: unknown) => {
    const parsed = schemas.BrowserActivateRequest.safeParse(raw);
    if (parsed.success) activateBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserDevtools, (_event, raw: unknown) => {
    const parsed = schemas.BrowserDevtoolsRequest.safeParse(raw);
    if (parsed.success) toggleBrowserDevTools(parsed.data.tabId, parsed.data.mode);
  });

  ipcMain.on(CHANNELS.browserFind, (_event, raw: unknown) => {
    const parsed = schemas.BrowserFindRequest.safeParse(raw);
    if (parsed.success) findInBrowserTab(parsed.data.tabId, parsed.data.text, parsed.data.forward);
  });

  ipcMain.on(CHANNELS.browserFindStop, (_event, raw: unknown) => {
    const parsed = schemas.BrowserFindStopRequest.safeParse(raw);
    if (parsed.success) stopFindInBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserZoom, (_event, raw: unknown) => {
    const parsed = schemas.BrowserZoomRequest.safeParse(raw);
    if (parsed.success) setBrowserZoom(parsed.data.tabId, parsed.data.factor);
  });

  ipcMain.on(CHANNELS.browserSetKeepAwake, (_event, raw: unknown) => {
    const parsed = schemas.BrowserSetKeepAwakeRequest.safeParse(raw);
    if (parsed.success) setBrowserKeepAwake(parsed.data.tabId, parsed.data.keepAwake);
  });

  ipcMain.on(CHANNELS.browserSetDiscardMs, (_event, raw: unknown) => {
    const parsed = schemas.BrowserSetDiscardMsRequest.safeParse(raw);
    if (parsed.success) setBrowserDiscardMs(parsed.data.ms);
  });

  handleBare(CHANNELS.browserClearData, async () => {
    await clearBrowserData();
    return ok();
  });

  /*
    The one request/response browser channel that touches neither a
    `WebContentsView` nor the session (Phase 71 Theme C). An invalid payload —
    a port outside `1..65535`, or not a number at all — answers
    `{listening:false}` rather than an error envelope: the caller's question is
    "should I offer a dev-server tile?", and "no" is the correct answer to a
    question that was malformed.
  */
  handle(
    CHANNELS.browserDevServerProbe,
    schemas.BrowserDevServerProbeRequest,
    async ({ port }) => ({ listening: await probeLoopbackPort(port) }),
    () => ({ listening: false }),
  );
}
