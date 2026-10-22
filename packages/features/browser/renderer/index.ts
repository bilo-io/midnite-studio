/**
 * The browser feature's renderer half (Phase 113 Theme L): the embedded browser pane — its tab strip,
 * launcher, `Mod+Tab`-style layout switcher, find bar and new-tab page — and the web-apps rail and
 * flyout. Needs the frame (bridge, chrome port, focus trap, sortable rows) and its own
 * {@link BrowserHost} for what sits on app state and the chrome the composing app still owns.
 *
 * State and pure rules without components are `./renderer/store` — import that where the pane is not drawn.
 */
export { browserManifest, type BrowserManifest } from '../manifest';
export {
  BrowserHostProvider,
  DEFAULT_BROWSER_REPUTATION_FEEDS,
  useBrowserHost,
  type BrowserContextMenuProps,
  type BrowserDismissOptions,
  type BrowserHost,
  type BrowserMenuItem,
  type BrowserModalProps,
  type BrowserReputationFeeds,
  type BrowserUiPatch,
  type BrowserUiState,
  type BrowserUiStore,
} from './host';

export * from './store';

// The pane and the surfaces around it.
export { BrowserPane } from './browser/browser-pane';
export { BrowserLauncher } from './browser/browser-launcher';
export { BrowserSwitcherOverlay } from './browser/browser-switcher-overlay';
export { BrowserLayoutIllustration } from './browser/layout-illustration';
export { boundsFromRect, useBrowserBounds } from './browser/use-browser-bounds';
export { useDevServer, useDevServerFor } from './browser/use-dev-server';

// The web-apps rail, its flyout and a detached app's pane.
export { WebAppsRailRow } from './web-apps/web-apps-rail-row';
export { WebAppsFlyoutPanel } from './web-apps/web-apps-flyout-panel';
export { WebAppPane } from './web-apps/web-app-pane';
export { useWebAppsSync } from './web-apps/use-web-apps-sync';
