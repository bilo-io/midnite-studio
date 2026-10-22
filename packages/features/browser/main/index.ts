import { defineFeatureMain } from '@midnite/studio-runtime';

import { browserManifest } from '../manifest';
import type { BrowserHostWindow } from './browser-electron';
import { registerBrowserHandlers, type BrowserSenderIpc } from './browser-handlers';
import { installBrowserMain, type BrowserMainDeps } from './browser-main-deps';
import { registerWebAppsHandlers } from './web-apps-handlers';

export { browserManifest, type BrowserManifest } from '../manifest';
export type {
  BrowserCookieDomain,
  BrowserElectron,
  BrowserHostWindow,
  BrowserInput,
  BrowserSession,
  BrowserView,
  BrowserViewOptions,
  BrowserWebContents,
} from './browser-electron';
export { isFromOwningWindow, registerBrowserHandlers, type BrowserSenderIpc } from './browser-handlers';
export { browserMainDeps, installBrowserMain, type BrowserDiscardSettings, type BrowserLog, type BrowserMainDeps } from './browser-main-deps';
// Phase 117 Theme A: the one session policy and the pinned page webPreferences, for a composer's own views.
export {
  applyBrowserSessionPolicy,
  refuseWebviewAttach,
  sandboxedPageWebPreferences,
  type BrowserSessionPolicyOptions,
  type GuardedPageContents,
  type PolicySession,
} from './browser-session-policy';
// The security posture — every guard exported as it was from desktop's `browser-security.ts`.
export {
  allowAppAudioOnly,
  cancelDownload,
  checkNavigationUrl,
  denyAllDevices,
  denyAllPermissions,
  isAppOrigin,
  isAudioOnlyAppCheck,
  isAudioOnlyAppRequest,
  type BrowserPermission,
  type DeviceSession,
  type DownloadItemLike,
  type ExtraPermissionRule,
  type OnlyHttpAllowed,
  type PermissionCheckDetails,
  type PermissionRequestDetails,
  type PermissionSession,
} from './browser-security';
export {
  activateBrowserTab,
  clearBrowserData,
  closeBrowserTab,
  createBrowserTab,
  destroyAllBrowserTabs,
  discardBrowserTab,
  getBrowserTabOwners,
  ownerWindowForBrowserTab,
  reparentBrowserTabs,
  startBrowserDiscardSweep,
  stopBrowserDiscardSweep,
} from './browser-service';
export { DEV_SERVER_PROBE_TIMEOUT_MS, probeLoopbackPort } from './dev-server-probe';
export { listWebAppSignIns, signOutWebApp } from './web-app-sign-ins';
export {
  activateWebApp,
  destroyAllWebApps,
  disableWebApp,
  enableWebApp,
  getWebAppOwners,
  isWebAppDiscarded,
  reparentWebAppView,
  startWebAppsDiscardSweep,
  stopWebAppsDiscardSweep,
} from './web-apps-service';
export { registerWebAppsHandlers } from './web-apps-handlers';

/**
 * The browser feature's main half (Phase 113 Theme L) — `browser-service.ts`, `web-apps-service.ts`,
 * `browser-security.ts` and their IPC, moved out of `packages/desktop/src/main` and
 * `ipc/{browser,web-apps}-handlers.ts`.
 *
 * What only the composer knows arrives here:
 *
 * - **`electron`, `log`, `readDiscardSettings`** — installed once ({@link installBrowserMain}): the real
 *   `WebContentsView`/`session`/`screen`/`shell` behind a structural port, the composer's logger, and
 *   the two settings the web-apps idle sweep reads.
 * - **`sender`** — the sender-resolved registrations for `create`, `setBounds` and `setVisible`, which
 *   act on the window that asked.
 * - **`getMainWindow`** — the window the web-apps flyout lives in (`enable`/`activate` target it, never
 *   the sender: the flyout is a main-window-only surface).
 *
 * The idle-discard sweeps are started by the composer (`startBrowserDiscardSweep`,
 * `startWebAppsDiscardSweep`) and every view is torn down by it on quit (`destroyAllBrowserTabs`,
 * `destroyAllWebApps`), exactly as desktop's `index.ts` always did.
 *
 * **No embedded page can reach the bridge.** Every view is sandboxed, context-isolated and created with
 * no preload; navigation is `http:`/`https:` only; every permission is denied; downloads are refused.
 * All of it is `browser-security.ts`, moved byte-for-byte with its tests.
 */
export type BrowserMainServices = BrowserMainDeps & {
  sender: BrowserSenderIpc;
  getMainWindow: () => BrowserHostWindow | null;
};

export const browserMain = defineFeatureMain<BrowserMainServices>({
  feature: browserManifest.feature,
  channels: browserManifest.ipc,
  register(ctx, services) {
    installBrowserMain({
      electron: services.electron,
      log: services.log,
      readDiscardSettings: services.readDiscardSettings,
      devToolsAllowed: services.devToolsAllowed ?? false,
    });
    registerBrowserHandlers(ctx.ipc, services.sender);
    registerWebAppsHandlers(ctx.ipc, services.getMainWindow);
  },
});
