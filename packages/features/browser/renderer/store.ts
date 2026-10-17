/**
 * The browser's state and its pure vocabulary, without its components (Phase 113 Theme L).
 *
 * `ui-store`, the companion, the window sync, the forge's preview chip and the settings page all read
 * the browser's tabs or reuse one of its rules; none of them draws the pane. Importing this entry
 * instead of `./renderer` keeps the pane, its dnd-kit strip and its host port out of every such
 * module's graph. Nothing here needs a {@link BrowserHost}.
 */
export {
  clampZoomFactor,
  derivedGroupIds,
  effectiveGroupId,
  nextActiveAfterClose,
  originOf,
  pushRecentOrigin,
  useBrowserStore,
  ZOOM_STEP,
  type BrowserShortcutTile,
  type BrowserTab,
  type BrowserTabGroup,
  type BrowserTabKind,
  type BrowserViewportPreset,
} from './browser-store';
export {
  BROWSER_LAYOUT_OPTIONS,
  browserLayoutIndex,
  cycleBrowserLayout,
  stepBrowserLayout,
  type BrowserLayout,
  type BrowserLayoutOption,
} from './browser/browser-layouts';
export { buildPreviewDeployPattern, matchPreviewDeploy, PREVIEW_DEPLOY_HOSTS } from './browser/preview-deploy';
export {
  DEV_SERVER_PORTS,
  detectDevServer,
  devServerLabel,
  devServerUrl,
  extractPort,
  type DevServerHint,
  type PortProbe,
} from './browser/dev-server';
export { resolveInput, trimUrlForDisplay, type SearchEngine } from './browser/resolve-input';
export {
  colorForRepoId,
  DEFAULT_TAB_GROUP_COLOR,
  TAB_GROUP_COLORS,
  tabGroupColorValue,
  type TabGroupColor,
} from './browser/tab-group-colors';
export {
  FALLBACK_WALLPAPERS,
  getWallpaperForTheme,
  WALLPAPER_STORAGE_KEY,
  WALLPAPER_THEMES,
  type WallpaperInfo,
  type WallpaperTheme,
} from './browser/wallpaper';
