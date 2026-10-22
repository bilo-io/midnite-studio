import type { RuntimeIpc } from '@midnite/studio-runtime';
import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';
import type { z } from 'zod';

import type { BrowserHostWindow } from './browser-electron';
import { defaultLogger } from './browser-main-deps';
import {
  activateBrowserTab,
  backBrowserTab,
  clearBrowserData,
  closeBrowserTab,
  createBrowserTab,
  findInBrowserTab,
  forwardBrowserTab,
  listBrowserPermissions,
  navigateBrowserTab,
  ownerWindowForBrowserTab,
  reloadBrowserTab,
  resetAllBrowserPermissions,
  resolveBrowserPermission,
  revokeBrowserPermission,
  setBrowserBounds,
  setBrowserDiscardMs,
  setBrowserKeepAwake,
  setBrowserSpellcheck,
  proceedBrowserSite,
  setBrowserVisible,
  setBrowserZoom,
  stopBrowserTab,
  stopFindInBrowserTab,
  toggleBrowserDevTools,
} from './browser-service';
import { setBrowserSiteSafety } from './browser-site-safety';
import { probeLoopbackPort } from './dev-server-probe';

/**
 * The sender-resolved registrations the browser's channels need (Phase 113 Theme L) — the runtime's
 * plain {@link RuntimeIpc} does not carry the sending window, and `create`/`setBounds`/`setVisible`
 * must act on the window that asked (forge's `ForgePollSubscriptions` precedent). Studio's adapter is
 * desktop's `handleFromSender`/`handleSendFromSender`, which resolve the window from `event.sender`
 * exactly as these handlers did when they lived there; an app with one window resolves it the same way.
 * Payloads are zod-parsed by the composer before a handler sees them, as for every other channel.
 */
export type BrowserSenderIpc = {
  /** An `invoke` handler that learns the sending window (null when it cannot be resolved). */
  handleFromSender<S extends z.ZodTypeAny, R>(
    channel: string,
    schema: S,
    handler: (payload: z.output<S>, win: BrowserHostWindow | null) => Promise<R> | R,
    onInvalid: (issue: string) => R,
  ): void;
  /** A one-way channel that learns the sending window; a throwing handler is reported through `onInvalid`. */
  sendFromSender<S extends z.ZodTypeAny>(
    channel: string,
    schema: S,
    handler: (payload: z.output<S>, win: BrowserHostWindow | null) => void,
    onInvalid: (issue: string) => void,
  ): void;
};

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
 * tab. `sender` is the window the push came from, resolved by the composer
 * from `event.sender` (desktop's `resolveWindow`) — the same comparison this
 * made when it resolved the window itself.
 */
export function isFromOwningWindow(sender: BrowserHostWindow | null, tabId: string): boolean {
  const owner = ownerWindowForBrowserTab(tabId);
  return owner === null || sender === owner;
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
export function registerBrowserHandlers(ipc: RuntimeIpc, sender: BrowserSenderIpc): void {
  sender.handleFromSender(
    CHANNELS.browserCreate,
    schemas.BrowserCreateRequest,
    async ({ tabId, url }, win) => {
      if (!win) return { ok: false as const, message: 'No window' };
      createBrowserTab(win, tabId, url);
      return { ok: true as const };
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipc.send(
    CHANNELS.browserClose,
    schemas.BrowserCloseRequest,
    ({ tabId }) => closeBrowserTab(tabId),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserNavigate,
    schemas.BrowserNavigateRequest,
    ({ tabId, url }) => navigateBrowserTab(tabId, url),
    warnInvalid,
  );
  ipc.send(CHANNELS.browserBack, schemas.BrowserBackRequest, ({ tabId }) => backBrowserTab(tabId), warnInvalid);
  ipc.send(
    CHANNELS.browserForward,
    schemas.BrowserForwardRequest,
    ({ tabId }) => forwardBrowserTab(tabId),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserReload,
    schemas.BrowserReloadRequest,
    ({ tabId }) => reloadBrowserTab(tabId),
    warnInvalid,
  );
  ipc.send(CHANNELS.browserStop, schemas.BrowserStopRequest, ({ tabId }) => stopBrowserTab(tabId), warnInvalid);

  sender.sendFromSender(
    CHANNELS.browserSetBounds,
    schemas.BrowserSetBoundsRequest,
    ({ tabId, bounds }, win) => {
      if (isFromOwningWindow(win, tabId)) setBrowserBounds(tabId, bounds);
    },
    warnInvalid,
  );

  sender.sendFromSender(
    CHANNELS.browserSetVisible,
    schemas.BrowserSetVisibleRequest,
    ({ tabId, visible }, win) => {
      if (isFromOwningWindow(win, tabId)) setBrowserVisible(tabId, visible);
    },
    warnInvalid,
  );

  ipc.send(
    CHANNELS.browserActivate,
    schemas.BrowserActivateRequest,
    ({ tabId }) => activateBrowserTab(tabId),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserDevtools,
    schemas.BrowserDevtoolsRequest,
    ({ tabId, mode }) => toggleBrowserDevTools(tabId, mode),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserFind,
    schemas.BrowserFindRequest,
    ({ tabId, text, forward }) => findInBrowserTab(tabId, text, forward),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserFindStop,
    schemas.BrowserFindStopRequest,
    ({ tabId }) => stopFindInBrowserTab(tabId),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserZoom,
    schemas.BrowserZoomRequest,
    ({ tabId, factor }) => setBrowserZoom(tabId, factor),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserSetKeepAwake,
    schemas.BrowserSetKeepAwakeRequest,
    ({ tabId, keepAwake }) => setBrowserKeepAwake(tabId, keepAwake),
    warnInvalid,
  );
  ipc.send(
    CHANNELS.browserSetDiscardMs,
    schemas.BrowserSetDiscardMsRequest,
    ({ ms }) => setBrowserDiscardMs(ms),
    warnInvalid,
  );

  ipc.handleBare(CHANNELS.browserClearData, async () => {
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
  ipc.handle(
    CHANNELS.browserDevServerProbe,
    schemas.BrowserDevServerProbeRequest,
    async ({ port }) => ({ listening: await probeLoopbackPort(port) }),
    () => ({ listening: false }),
  );

  ipc.send(
    CHANNELS.browserPermissionResponse,
    schemas.BrowserPermissionResponseRequest,
    ({ requestId, decision }) => resolveBrowserPermission(requestId, decision),
    warnInvalid,
  );

  ipc.handleBare(CHANNELS.browserPermissionsList, async () => {
    return listBrowserPermissions();
  });

  ipc.handle(
    CHANNELS.browserPermissionRevoke,
    schemas.BrowserPermissionRevokeRequest,
    async ({ origin, permission }) => {
      revokeBrowserPermission(origin, permission);
      return ok();
    },
    (issue) => failure(issue),
  );

  ipc.handleBare(CHANNELS.browserPermissionsReset, async () => {
    resetAllBrowserPermissions();
    return ok();
  });

  ipc.send(
    CHANNELS.browserSetSpellcheck,
    schemas.BrowserSetSpellcheckRequest,
    ({ enabled }) => setBrowserSpellcheck(enabled),
    warnInvalid,
  );

  ipc.send(
    CHANNELS.browserSetSiteSafety,
    schemas.BrowserSetSiteSafetyRequest,
    (req) => setBrowserSiteSafety(req),
    warnInvalid,
  );

  ipc.send(
    CHANNELS.browserProceedSite,
    schemas.BrowserProceedSiteRequest,
    ({ tabId, url }) => proceedBrowserSite(tabId, url),
    warnInvalid,
  );
}
