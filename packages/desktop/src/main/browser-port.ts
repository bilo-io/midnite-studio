import {
  reparentBrowserTabs as reparentFeatureBrowserTabs,
  reparentWebAppView as reparentFeatureWebAppView,
  type BrowserElectron,
  type BrowserHostWindow,
  type BrowserViewOptions,
} from '@midnite/studio-feature-browser/main';
import type { WebAppId } from '@midnite/studio-shared';
import { clipboard, screen, session, shell, WebContentsView, type BrowserWindow } from 'electron';

/**
 * Studio's Electron for the browser feature's main half (Phase 113 Theme L) — the `WebContentsView`,
 * `session`, `screen` and `shell` `browser-service.ts`/`web-apps-service.ts` imported directly while
 * they lived here. The feature declares narrow structural ports for them (it may not import
 * `electron`); Electron's real classes are wider and overloaded, so they are cast once, here, as
 * `games/game-electron.ts` does for the games runner. Every object passed is the real one — the window
 * a tab is attached to is still the `BrowserWindow` `resolveWindow` hands back, so the services'
 * identity comparisons (`tracked.win === next`, the sender-ownership guard) are unchanged.
 */
export function createStudioBrowserElectron(): BrowserElectron {
  const electron: { [K in keyof BrowserElectron]: unknown } = {
    createView: (options: BrowserViewOptions) => new WebContentsView(options as ConstructorParameters<typeof WebContentsView>[0]),
    sessionFromPartition: (partition: string) => session.fromPartition(partition),
    onDisplayMetricsChanged: (listener: () => void) => {
      screen.on('display-metrics-changed', listener);
    },
    openExternal: (url: string) => shell.openExternal(url),
    // Phase 117 Theme G: the ClickFix watch reads the system clipboard from main, and its bar clears it.
    readClipboardText: () => clipboard.readText(),
    clearClipboard: () => clipboard.clear(),
  };
  return electron as unknown as BrowserElectron;
}

/** A Studio window, as the feature's window port. */
export const asBrowserHostWindow = (win: BrowserWindow): BrowserHostWindow => win as unknown as BrowserHostWindow;

/** `reparentBrowserTabs` over a Studio window — the detach/re-dock path's call, unchanged. */
export function reparentBrowserTabs(next: BrowserWindow): void {
  reparentFeatureBrowserTabs(asBrowserHostWindow(next));
}

/** `reparentWebAppView` over a Studio window — the detach/re-dock path's call, unchanged. */
export function reparentWebAppView(id: WebAppId, next: BrowserWindow, opts?: { visible?: boolean }): void {
  reparentFeatureWebAppView(id, asBrowserHostWindow(next), opts);
}
