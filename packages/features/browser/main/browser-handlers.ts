import type { IpcMainEvent } from 'electron';

import { CHANNELS, ok, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
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
import { handle, handleBare, handleFromSender, handleSend, handleSendFromSender } from './handle';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

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

  handleSend(
    CHANNELS.browserClose,
    schemas.BrowserCloseRequest,
    ({ tabId }) => closeBrowserTab(tabId),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserNavigate,
    schemas.BrowserNavigateRequest,
    ({ tabId, url }) => navigateBrowserTab(tabId, url),
    warnInvalid,
  );
  handleSend(CHANNELS.browserBack, schemas.BrowserBackRequest, ({ tabId }) => backBrowserTab(tabId), warnInvalid);
  handleSend(
    CHANNELS.browserForward,
    schemas.BrowserForwardRequest,
    ({ tabId }) => forwardBrowserTab(tabId),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserReload,
    schemas.BrowserReloadRequest,
    ({ tabId }) => reloadBrowserTab(tabId),
    warnInvalid,
  );
  handleSend(CHANNELS.browserStop, schemas.BrowserStopRequest, ({ tabId }) => stopBrowserTab(tabId), warnInvalid);

  handleSendFromSender(
    CHANNELS.browserSetBounds,
    schemas.BrowserSetBoundsRequest,
    ({ tabId, bounds }, _win, event) => {
      if (isFromOwningWindow(event, tabId)) setBrowserBounds(tabId, bounds);
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.browserSetVisible,
    schemas.BrowserSetVisibleRequest,
    ({ tabId, visible }, _win, event) => {
      if (isFromOwningWindow(event, tabId)) setBrowserVisible(tabId, visible);
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.browserActivate,
    schemas.BrowserActivateRequest,
    ({ tabId }) => activateBrowserTab(tabId),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserDevtools,
    schemas.BrowserDevtoolsRequest,
    ({ tabId, mode }) => toggleBrowserDevTools(tabId, mode),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserFind,
    schemas.BrowserFindRequest,
    ({ tabId, text, forward }) => findInBrowserTab(tabId, text, forward),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserFindStop,
    schemas.BrowserFindStopRequest,
    ({ tabId }) => stopFindInBrowserTab(tabId),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserZoom,
    schemas.BrowserZoomRequest,
    ({ tabId, factor }) => setBrowserZoom(tabId, factor),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserSetKeepAwake,
    schemas.BrowserSetKeepAwakeRequest,
    ({ tabId, keepAwake }) => setBrowserKeepAwake(tabId, keepAwake),
    warnInvalid,
  );
  handleSend(
    CHANNELS.browserSetDiscardMs,
    schemas.BrowserSetDiscardMsRequest,
    ({ ms }) => setBrowserDiscardMs(ms),
    warnInvalid,
  );

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
