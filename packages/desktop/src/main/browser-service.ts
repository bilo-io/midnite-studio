import { WebContentsView, screen, session, shell, type BrowserWindow, type Input } from 'electron';

import {
  DEFAULT_BROWSER_DISCARD_MS,
  EVENT_CHANNELS,
  type BrowserBounds,
  type BrowserEvent,
  type CommandId,
} from '@midnite/studio-shared';

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
 *
 * Phase 84 Theme F adds a fourth teardown trigger, `discardBrowserTab`: a
 * hidden tab past an idle threshold. It reuses `closeBrowserTab`'s exact
 * teardown (drop the child view, close the contents, remove every listener)
 * but keeps the `BrowserTab` record alive in the renderer's own
 * `browser-store.ts` — main just forgets the `WebContentsView`. Reactivating
 * a discarded tab needs no special recreate path here: `use-browser-tabs.ts`
 * already calls `createBrowserTab` unconditionally on every activation
 * (idempotent when a view already exists), and `createBrowserTab` treats a
 * tab id it no longer has tracked as brand new — which, after a discard, it
 * is.
 */

const PARTITION = 'persist:browser';

/** `WebContentsView` has no `.destroy()` — dropping every reference and
 * detaching from the window is what actually frees it. */
type Tracked = { view: WebContentsView; win: BrowserWindow };

const tabs = new Map<string, Tracked>();

/**
 * The last `BrowserBounds` pushed for each tab, in the renderer's own CSS
 * pixels — pre-zoom-scale, since {@link setBrowserBounds} re-derives the
 * scaled value from whatever the window's zoom factor is AT RE-APPLY TIME
 * (Theme E). Re-applying the last known rect on a full-screen transition or a
 * display-metrics change avoids a round trip to the renderer during a
 * transition that is already janky, and main is the only side that can even
 * observe those two events.
 */
const lastBounds = new Map<string, BrowserBounds>();

/** Windows already wired for the full-screen re-push above — a guard, not a cache. */
const fullScreenReapplyWired = new WeakSet<BrowserWindow>();
let displayMetricsReapplyWired = false;

// --- idle discard (Phase 84 Theme F) ----------------------------------------

/** `Date.now()` from the moment each tracked tab last became hidden; absent = currently visible. */
const hiddenSince = new Map<string, number>();
/** Tabs the "Keep awake" toggle has opted out of discard — mirrored from `browser-store.ts`. */
const keepAwakeTabIds = new Set<string>();
/**
 * Which tabs are currently the visible one in their window — `View` has no
 * `getVisible()` to read back (only `setVisible`), so this mirrors every
 * call to it through {@link markViewVisible} rather than asking Electron.
 */
const visibleTabIds = new Set<string>();

function markViewVisible(tabId: string, view: WebContentsView, visible: boolean): void {
  view.setVisible(visible);
  if (visible) visibleTabIds.add(tabId);
  else visibleTabIds.delete(tabId);
}
/** Renderer-owned (`Settings ▸ Browser`), mirrored here on mount and on change. `0` disables discard. */
let discardMs = DEFAULT_BROWSER_DISCARD_MS;
let discardSweepTimer: ReturnType<typeof setInterval> | null = null;

export function setBrowserKeepAwake(tabId: string, keepAwake: boolean): void {
  if (keepAwake) keepAwakeTabIds.add(tabId);
  else keepAwakeTabIds.delete(tabId);
}

export function setBrowserDiscardMs(ms: number): void {
  discardMs = ms;
}

/**
 * Whether a tab currently eligible for the sweep to even consider should
 * actually be discarded — pure, so the threshold math has a direct unit
 * test the way `grantedWebglKeys`/`mountedSessionIds` do. `effectiveVisible`
 * folds in BOTH "this tab is the one on top in its window" and "that window
 * itself is on screen" — the doc's "hidden (`!visible`, or its owner window
 * hidden/minimized)" — since the sweep (below) is the only caller and always
 * has both booleans in hand already.
 */
export function isTabDiscardEligible(input: {
  effectiveVisible: boolean;
  audible: boolean;
  keepAwake: boolean;
  hiddenSinceMs: number | undefined;
  now: number;
  discardMs: number;
}): boolean {
  const { effectiveVisible, audible, keepAwake, hiddenSinceMs, now, discardMs: threshold } = input;
  if (effectiveVisible || audible || keepAwake) return false;
  if (threshold <= 0) return false;
  if (hiddenSinceMs === undefined) return false;
  return now - hiddenSinceMs >= threshold;
}

/**
 * One pass over every live tab: track how long each has been hidden, and
 * discard whatever has aged past the threshold. Downloads are not checked
 * here — `ensureSessionConfigured`'s `will-download` handler cancels every
 * download outright (see its own doc), so "a download in flight" cannot
 * occur on this partition today; the day that changes, this is where a
 * `wc.session` download-in-progress check belongs.
 */
/** Exported for `browser-service.test.ts` — deterministic, no fake timers needed. */
export function runBrowserDiscardSweep(): void {
  const now = Date.now();
  for (const [tabId, tracked] of tabs) {
    const { win, view } = tracked;
    if (win.isDestroyed() || view.webContents.isDestroyed()) continue;
    const effectiveVisible = visibleTabIds.has(tabId) && win.isVisible() && !win.isMinimized();

    if (effectiveVisible) {
      hiddenSince.delete(tabId);
      continue;
    }
    if (!hiddenSince.has(tabId)) hiddenSince.set(tabId, now);

    const eligible = isTabDiscardEligible({
      effectiveVisible,
      audible: view.webContents.isCurrentlyAudible(),
      keepAwake: keepAwakeTabIds.has(tabId),
      hiddenSinceMs: hiddenSince.get(tabId),
      now,
      discardMs,
    });
    if (eligible) discardBrowserTab(tabId);
  }
}

/** Started once from `main/index.ts`, alongside `registerBrowserHandlers`. */
export function startBrowserDiscardSweep(intervalMs = 30_000): void {
  if (discardSweepTimer) return;
  discardSweepTimer = setInterval(runBrowserDiscardSweep, intervalMs);
  discardSweepTimer.unref?.();
}

export function stopBrowserDiscardSweep(): void {
  if (discardSweepTimer) clearInterval(discardSweepTimer);
  discardSweepTimer = null;
}

function reapplyBoundsForWindow(win: BrowserWindow): void {
  for (const [tabId, tracked] of tabs) {
    if (tracked.win !== win) continue;
    const bounds = lastBounds.get(tabId);
    if (bounds) setBrowserBounds(tabId, bounds);
  }
}

function ensureFullScreenReapply(win: BrowserWindow): void {
  if (fullScreenReapplyWired.has(win)) return;
  fullScreenReapplyWired.add(win);
  win.on('enter-full-screen', () => reapplyBoundsForWindow(win));
  win.on('leave-full-screen', () => reapplyBoundsForWindow(win));
}

function ensureDisplayMetricsReapply(): void {
  if (displayMetricsReapplyWired) return;
  displayMetricsReapplyWired = true;
  screen.on('display-metrics-changed', () => {
    const windows = new Set([...tabs.values()].map((tracked) => tracked.win));
    for (const win of windows) reapplyBoundsForWindow(win);
  });
}

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

const sendCommand = (win: BrowserWindow, command: CommandId): void => {
  if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.menuCommand, command);
};

/**
 * Whether a native `before-input-event` keystroke is Mod+`key` with no other
 * modifier — `Mod` being Cmd on macOS, Ctrl elsewhere, same as the renderer's
 * own `chordFromEvent`.
 */
function isModChord(input: Input, key: string): boolean {
  const mod = process.platform === 'darwin' ? input.meta : input.control;
  return (
    input.type === 'keyDown' &&
    mod &&
    !input.shift &&
    !input.alt &&
    input.key.toLowerCase() === key
  );
}

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
      // No preload: an embedded page must have no path to window.midniteStudio,
      // and the cheapest way to guarantee that is to hand it nothing.
      sandbox: true,
    },
  });

  win.contentView.addChildView(view);
  markViewVisible(tabId, view, false);
  tabs.set(tabId, { view, win });
  ensureFullScreenReapply(win);
  ensureDisplayMetricsReapply();

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
    // Recorded as well as surfaced, since Phase 65 Theme D: the pane's
    // `destroyed` event tells the user, and the log tells whoever reads the
    // bug report afterwards.
    defaultLogger.error(
      `[browser] render-process-gone tab=${tabId} reason=${details.reason} exit=${details.exitCode}`,
    );
    send(win, { kind: 'destroyed', tabId, reason: 'crashed' });
  });
  // Not a crash — the view is alive but has stopped answering. Surfaced the
  // same way so the pane offers a reload rather than a frozen rectangle.
  wc.on('unresponsive', () => {
    defaultLogger.error(`[browser] unresponsive tab=${tabId}`);
    send(win, { kind: 'destroyed', tabId, reason: 'unresponsive' });
  });
  // `findInBrowserTab` calls `webContents.findInPage` but never listened for
  // its result until now — `find-bar.tsx`'s match count (Theme G).
  wc.on('found-in-page', (_event, result) => {
    send(win, {
      kind: 'found',
      tabId,
      matches: result.matches,
      activeMatchOrdinal: result.activeMatchOrdinal,
    });
  });

  /*
    Mod+w/Mod+t owned by hand, not by the app's usual keybinding path.

    This view is a genuinely separate `webContents` from the host window's own
    renderer — while a page inside it has keyboard focus, the renderer's
    window-level `keydown` capture listener (`use-keybindings.ts`) never sees
    the keystroke at all, unlike the terminal (an xterm textarea living in the
    SAME renderer DOM). With no Electron menu accelerator registered for
    either chord (see `menu.ts` — that was the actual leak: a native
    accelerator fires regardless of which webContents has focus, so it kept
    invoking `repo.close` even while a browser tab plainly owned the
    keystroke), a keystroke landing here would otherwise do nothing at all
    rather than the tab action it visibly should. `preventDefault()` also
    stops the page underneath from ever seeing the chord.
  */
  wc.on('before-input-event', (event, input) => {
    if (isModChord(input, 'w')) {
      event.preventDefault();
      sendCommand(win, 'browser.closeTab');
    } else if (isModChord(input, 't')) {
      event.preventDefault();
      sendCommand(win, 'browser.newTab');
    }
  });

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
  // a new tab" — which is what a browser user expects a middle-click or
  // Mod+click to do, and keeps every view this app owns inside the tab
  // model. `disposition` is how Electron tells a background-tab request
  // (middle-click, Mod+click with no Shift) apart from every other kind —
  // only that one must not steal focus from the tab the user is already on;
  // `foreground-tab` (Mod+Shift+click), `new-window` and `default` all read
  // as "show me the new tab" and activate it like `openTab()` would.
  wc.setWindowOpenHandler(({ url: requestedUrl, disposition }) => {
    if (checkNavigationUrl(requestedUrl).allowed) {
      send(win, {
        kind: 'open-tab',
        tabId,
        url: requestedUrl,
        foreground: disposition !== 'background-tab',
      });
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
  lastBounds.delete(tabId);
  hiddenSince.delete(tabId);
  keepAwakeTabIds.delete(tabId);
  visibleTabIds.delete(tabId);
  if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
  if (!tracked.view.webContents.isDestroyed()) {
    // The 13 per-tab handlers registered above (`did-navigate`,
    // `certificate-error`, the window-open handler, etc.) each close over
    // `win` and `tabId`. They die with the contents either way, but this
    // module's own docblock is explicit that "dropping every reference … is
    // what actually frees it" — a listener closure is a reference too.
    tracked.view.webContents.removeAllListeners();
    tracked.view.webContents.close();
  }
}

/**
 * Tear down a hidden tab's `WebContentsView` on its own, past the idle
 * threshold (Phase 84 Theme F) — everything `closeBrowserTab` does to the
 * view, MINUS forgetting the tab exists: `lastBounds` and `keepAwakeTabIds`
 * both stay, since this tab is coming back the moment it is clicked, and
 * `hiddenSince` is cleared so a freshly-recreated view starts its idle clock
 * over rather than reading as already-expired. The renderer is told via
 * `discarded` — unlike a close, it never asked for this.
 */
export function discardBrowserTab(tabId: string): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  tabs.delete(tabId);
  hiddenSince.delete(tabId);
  visibleTabIds.delete(tabId);
  if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
  if (!tracked.view.webContents.isDestroyed()) {
    tracked.view.webContents.removeAllListeners();
    tracked.view.webContents.close();
  }
  send(tracked.win, { kind: 'discarded', tabId });
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

export function toggleBrowserDevTools(tabId: string, mode: 'detach' | 'embed' = 'detach'): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (!wc) return;
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
  } else {
    wc.openDevTools({ mode: mode === 'detach' ? 'detach' : 'bottom' });
  }
}

export function findInBrowserTab(tabId: string, text: string, forward = true): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (!wc) return;
  wc.findInPage(text, { forward, findNext: true });
}

export function stopFindInBrowserTab(tabId: string): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (!wc) return;
  wc.stopFindInPage('clearSelection');
}

/**
 * Bounds arrive in CSS pixels; `WebContentsView.setBounds` wants device
 * pixels. The two units diverge the moment a user presses the host window's
 * own `Mod+=` (its `zoomIn`/`zoomOut`/`resetZoom` menu roles, unrelated to a
 * TAB's own {@link setBrowserZoom}) — scaling here, in main, is the fix:
 * the renderer measures in CSS pixels and may not import `electron`, so it
 * has no legal way to read the window's zoom factor, while main already
 * holds the owning `BrowserWindow` for every tracked tab (Theme E).
 */
export function setBrowserBounds(tabId: string, bounds: BrowserBounds): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  lastBounds.set(tabId, bounds);
  const factor = tracked.win.webContents.getZoomFactor();
  tracked.view.setBounds({
    x: Math.round(bounds.x * factor),
    y: Math.round(bounds.y * factor),
    width: Math.round(bounds.width * factor),
    height: Math.round(bounds.height * factor),
  });
}

/** Closing the pane hides the view rather than destroying it — page state survives a reopen. */
export function setBrowserVisible(tabId: string, visible: boolean): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  markViewVisible(tabId, tracked.view, visible);
}

/**
 * The window a tracked tab's `WebContentsView` currently lives in, or `null`
 * for an unknown tab — `browser-handlers.ts`'s sender-scoping guard for
 * `browserSetBounds`/`browserSetVisible` (Theme E): with the browser
 * detached into its own popout, a stale push from the window that no longer
 * hosts a reparented tab is expected during the reparent, not an error.
 */
export function ownerWindowForBrowserTab(tabId: string): BrowserWindow | null {
  return tabs.get(tabId)?.win ?? null;
}

/**
 * An absolute zoom factor for one tab (Theme G), never a delta — the
 * renderer already owns per-origin persistence.
 */
export function setBrowserZoom(tabId: string, factor: number): void {
  tabs.get(tabId)?.view.webContents.setZoomFactor(factor);
}

/**
 * Only one view is ever attached-and-visible PER WINDOW; every other tab in
 * the SAME window is hidden. Narrowed from a process-wide loop (Phase 55):
 * `reparentBrowserTabs` means a tab can now live in a different window than
 * the one activating another tab, and the old unconditional loop would hide
 * a tab showing correctly in a popout the instant any tab was clicked in
 * main.
 */
export function activateBrowserTab(tabId: string): void {
  const activating = tabs.get(tabId);
  if (!activating) return;
  for (const [id, tracked] of tabs) {
    if (tracked.win === activating.win) markViewVisible(id, tracked.view, id === tabId);
  }
}

/**
 * Move every tracked tab's `WebContentsView` to `next` (Phase 55) — detaching
 * or re-docking the Embedded Browser. `partition: 'persist:browser'` is
 * untouched: the view keeps its `webContents`, so cookies, storage, login
 * sessions, navigation history and in-page DOM state all survive by
 * construction. No `loadURL`, no `reload`, no `setWindowOpenHandler`
 * re-registration.
 */
export function reparentBrowserTabs(next: BrowserWindow): void {
  for (const [tabId, tracked] of tabs) {
    if (tracked.win === next) continue;
    if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
    if (!next.isDestroyed()) next.contentView.addChildView(tracked.view);
    tabs.set(tabId, { view: tracked.view, win: next });
  }
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
  lastBounds.clear();
  securityConfigured = false;
  displayMetricsReapplyWired = false;
  hiddenSince.clear();
  keepAwakeTabIds.clear();
  visibleTabIds.clear();
  discardMs = DEFAULT_BROWSER_DISCARD_MS;
  stopBrowserDiscardSweep();
}
