/**
 * The browser feature's internals, for tests that exercise it *as a composing app wires it* —
 * Studio's `packages/app/src/compose/browser/` suite renders these under its real providers and mock
 * bridge (Phase 113 Theme L).
 *
 * Not for production code: an app composes the feature through `@midnite/studio-feature-browser/renderer`.
 */
export { BrowserLauncher } from './browser/browser-launcher';
export { BrowserPane } from './browser/browser-pane';
export { BrowserSwitcherOverlay } from './browser/browser-switcher-overlay';
export { NewTabPage } from './browser/new-tab-page';
export { BrowserTabStrip } from './browser/tab-strip';
export { useBrowserBounds, boundsFromRect } from './browser/use-browser-bounds';
export { useBrowserTabsEffects } from './browser/use-browser-tabs';
export { WebAppsFlyoutPanel } from './web-apps/web-apps-flyout-panel';
export { WebAppsRailRow } from './web-apps/web-apps-rail-row';
