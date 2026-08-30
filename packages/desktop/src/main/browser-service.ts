import { WebContentsView, session, shell, type BrowserWindow } from 'electron';

import { EVENT_CHANNELS, type BrowserBounds, type BrowserEvent } from '@midnite/git-shared';

import { cancelDownload, checkNavigationUrl, denyAllPermissions } from './browser-security';
import { defaultLogger } from './log';

/**
 * The main-process half of the embedded browser (Phase 32 Theme A/B).
 *
 * The only file in the repo that constructs a `WebContentsView`. Owns a
 * `Map<tabId, WebContentsView>` the way `pty-service.ts` owns its pty map,
 * creates views lazily on first activation (Theme C decides when that is —
 * this module just exposes `createTab`), and tears every one of them down on
 * tab close, window close and `before-quit`.
 */

const PARTITION = 'persist:browser';

/** `WebContentsView` has no `.destroy()` — dropping every reference and
 * detaching from the window is what actually frees it. */
type Tracked = { view: WebContentsView; win: BrowserWindow };

const tabs = new Map<string, Tracked>();

let securityConfigured = false;

/**
 * Configure the `persist:browser` session exactly once, on first use.
 *
 * Session-level handlers (permissions, downloads) apply to every
 * `WebContentsView` on the partition, so re-registering per tab would just
 * overwrite the same handler with an identical one — a guard, not a cache.
 */
function ensureSessionConfigured(): void {
  if (securityConfigured) return;
  securityConfigured = true;
  const browserSession = session.fromPartition(PARTITION);
  denyAllPermissions(browserSession);
  browserSession.on('will-download', (_event, item, webContents) => {
    // Session-level, so the item arrives with the `webContents` that asked
    // for it rather than a tab id — reverse-lookup so the notice lands on
    // the tab the user was actually looking at.
    const entry = [...tabs.entries()].find(([, t]) => t.view.webContents === webContents);
    cancelDownload(item, (filename) => {
      defaultLogger(`[browser] download refused: ${filename}`);
      if (entry) send(entry[1].win, { kind: 'download-blocked', tabId: entry[0], filename });
    });
  });
}

const send = (win: BrowserWindow, event: BrowserEvent): void => {
  if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.browserEvent, event);
};

/**
 * Create a tab's view and load its first URL.
 *
 * Not attached to the window's `contentView` here — Theme C/E's activation
 * flow calls `setBrowserVisible`/`setBrowserBounds` once the tab is actually
 * shown, and an inactive background tab (per the "restore as inactive
 * records" decision) never reaches this at all until clicked.
 */
export function createBrowserTab(win: BrowserWindow, tabId: string, url: string): void {
  ensureSessionConfigured();
  if (tabs.has(tabId)) return;

  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      // No preload: an embedded page must have no path to window.midniteGit,
      // and the cheapest way to guarantee that is to hand it nothing.
      sandbox: true,
    },
  });

  win.contentView.addChildView(view);
  view.setVisible(false);
  tabs.set(tabId, { view, win });

  const wc = view.webContents;

  wc.on('did-navigate', (_event, navigatedUrl) => {
    send(win, {
      kind: 'navigated',
      tabId,
      url: navigatedUrl,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
  });
  wc.on('did-navigate-in-page', (_event, navigatedUrl) => {
    send(win, {
      kind: 'navigated',
      tabId,
      url: navigatedUrl,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
  });
  wc.on('page-title-updated', (_event, title) => send(win, { kind: 'title', tabId, title }));
  wc.on('page-favicon-updated', (_event, favicons) => {
    send(win, { kind: 'favicon', tabId, ...(favicons[0] ? { faviconUrl: favicons[0] } : {}) });
  });
  wc.on('did-start-loading', () => send(win, { kind: 'loading', tabId, loading: true }));
  wc.on('did-stop-loading', () => send(win, { kind: 'loading', tabId, loading: false }));
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    // -3 is ERR_ABORTED — a navigation superseded by another (typing a new
    // URL before the previous one finished), not a real failure to show.
    if (!isMainFrame || errorCode === -3) return;
    send(win, {
      kind: 'failed',
      tabId,
      error: { code: errorCode, description: errorDescription, validatedUrl },
    });
  });
  wc.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    send(win, { kind: 'destroyed', tabId, reason: 'crashed' });
  });
  // Not a crash — the view is alive but has stopped answering. Surfaced the
  // same way so the pane offers a reload rather than a frozen rectangle.
  wc.on('unresponsive', () => send(win, { kind: 'destroyed', tabId, reason: 'unresponsive' }));

  // Only `http:`/`https:` proceed — Theme B's navigation policy. Blocking
  // here (rather than only refusing the renderer's own `browserNavigate`
  // request) is what stops a page's own link click or redirect too.
  wc.on('will-navigate', (details) => {
    const check = checkNavigationUrl(details.url);
    if (check.allowed) return;
    details.preventDefault();
    send(win, {
      kind: 'failed',
      tabId,
      error: {
        code: -30, // ERR_UNSAFE_PORT-adjacent: a scheme this app refuses, not a network failure.
        description: `Blocked navigation to ${check.blockedScheme ?? 'unknown'} scheme`,
        validatedUrl: details.url,
      },
    });
  });
  wc.on('will-redirect', (details) => {
    if (!checkNavigationUrl(details.url).allowed) details.preventDefault();
  });

  // `target="_blank"`/`window.open` never spawn an unmanaged BrowserWindow.
  // Denied at the engine, then handed back to the renderer as "open this as
  // a new tab" — which is what a browser user expects a middle-click to do,
  // and keeps every view this app owns inside the tab model.
  wc.setWindowOpenHandler(({ url: requestedUrl }) => {
    if (checkNavigationUrl(requestedUrl).allowed) {
      send(win, { kind: 'open-tab', tabId, url: requestedUrl });
    }
    return { action: 'deny' };
  });

  // The default (reject) stands: no "proceed anyway" affordance this phase.
  wc.on('certificate-error', (event, url) => {
    event.preventDefault();
    defaultLogger(`[browser] certificate error, refused: ${url}`);
  });

  void wc.loadURL(url);
}

export function closeBrowserTab(tabId: string): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  tabs.delete(tabId);
  if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
  if (!tracked.view.webContents.isDestroyed()) tracked.view.webContents.close();
}

export function navigateBrowserTab(tabId: string, url: string): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  if (!checkNavigationUrl(url).allowed) return;
  void tracked.view.webContents.loadURL(url);
}

export function backBrowserTab(tabId: string): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
}

export function forwardBrowserTab(tabId: string): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
}

export function reloadBrowserTab(tabId: string): void {
  tabs.get(tabId)?.view.webContents.reload();
}

export function stopBrowserTab(tabId: string): void {
  tabs.get(tabId)?.view.webContents.stop();
}

export function setBrowserBounds(tabId: string, bounds: BrowserBounds): void {
  tabs.get(tabId)?.view.setBounds(bounds);
}

/** Closing the pane hides the view rather than destroying it — page state survives a reopen. */
export function setBrowserVisible(tabId: string, visible: boolean): void {
  tabs.get(tabId)?.view.setVisible(visible);
}

/** Only one view is ever attached-and-visible; every other tracked tab is hidden. */
export function activateBrowserTab(tabId: string): void {
  for (const [id, tracked] of tabs) tracked.view.setVisible(id === tabId);
}

export async function clearBrowserData(): Promise<void> {
  const browserSession = session.fromPartition(PARTITION);
  await browserSession.clearStorageData();
  await browserSession.clearCache();
}

/** External-link fallback for a scheme this session refuses to load in-place. */
export function openInSystemBrowser(url: string): void {
  void shell.openExternal(url);
}

/** Window close, `before-quit`: destroy every tracked view — nothing survives past the process. */
export function destroyAllBrowserTabs(): void {
  for (const [tabId] of tabs) closeBrowserTab(tabId);
}

/** Test-only: drop every tracked tab without tearing down real Electron state. */
export function resetBrowserServiceForTests(): void {
  tabs.clear();
  securityConfigured = false;
}
