import { WebContentsView, session, shell, type BrowserWindow } from 'electron';

import { APP_DEFINITIONS, type AppId, type BrowserBounds } from '@midnite/studio-shared';

import { cancelDownload, checkNavigationUrl, denyAllPermissions } from './browser-security';
import { defaultLogger } from './log';
import { currentSettings } from './settings-mirror';

/**
 * The main-process half of the third-party apps rail (Phase 83 Themes A/B).
 *
 * Structured like `browser-service.ts` — a `Map<AppId, Tracked>` of one entry
 * per ENABLED app, lazily created on `enableApp` and torn down on
 * `disableApp` — but where the browser shares one `persist:browser`
 * partition across every tab, each app here gets its OWN
 * `persist:app-<id>` partition (`AppDefinition.partition`), so a Spotify
 * login can never read a Calendar cookie or a general browser tab's session.
 *
 * No preload, no bridge, no chrome events: these apps have no tab strip and
 * nothing for the renderer to reflect back — the only main→renderer contract
 * is "is it on screen" (`enableApp`/`disableApp`) and "where" (`setAppBounds`).
 */

type Tracked = { view: WebContentsView; win: BrowserWindow };

const apps = new Map<AppId, Tracked>();

/** Timestamps when each app became hidden in its window or window minimized. */
const hiddenSince = new Map<AppId, number>();

/** Apps whose WebContentsView was torn down to free memory while idle (Phase 84 Theme F.4). */
const discardedApps = new Map<AppId, { win: BrowserWindow; bounds?: BrowserBounds }>();

/** The last bounds set for each app — restored when an idle-discarded app wakes up. */
const lastBounds = new Map<AppId, BrowserBounds>();

let appsDiscardSweepTimer: ReturnType<typeof setInterval> | null = null;

/** Partitions already configured — one session per app, guarded like `browser-service.ts`'s single one. */
const securedPartitions = new Set<string>();

/**
 * Configure one app's `persist:app-<id>` session exactly once. Reuses
 * `browser-security.ts`'s posture verbatim: deny every permission (request
 * AND check), and cancel any download loudly rather than starting one
 * nobody asked for a destination for.
 */
function ensureAppSessionConfigured(id: AppId): void {
  const partition = APP_DEFINITIONS[id].partition;
  if (securedPartitions.has(partition)) return;
  securedPartitions.add(partition);
  const appSession = session.fromPartition(partition);
  denyAllPermissions(appSession);
  appSession.on('will-download', (_event, item) => {
    cancelDownload(item, (filename) => {
      defaultLogger(`[apps] download refused: app=${id} file=${filename}`);
    });
  });
}

/**
 * Enable an app: construct its view (if not already constructed) against
 * `win`, attach it, and show it. Idempotent — enabling an already-enabled
 * app is a no-op, matching `createBrowserTab`'s own guard.
 */
export function enableApp(win: BrowserWindow, id: AppId): void {
  ensureAppSessionConfigured(id);
  discardedApps.delete(id);
  if (apps.has(id)) return;

  const definition = APP_DEFINITIONS[id];
  const view = new WebContentsView({
    webPreferences: {
      partition: definition.partition,
      contextIsolation: true,
      nodeIntegration: false,
      // No preload: an embedded app must have no path to window.midniteStudio —
      // same rule Phase 32 wrote for the browser's own views.
      sandbox: true,
    },
  });

  win.contentView.addChildView(view);
  apps.set(id, { view, win });

  const wc = view.webContents;

  // Only `http:`/`https:` proceed — identical to the browser's own policy.
  // No event pushed back to the renderer: an app view has no chrome for one
  // to update.
  wc.on('will-navigate', (details) => {
    if (!checkNavigationUrl(details.url).allowed) details.preventDefault();
  });
  wc.on('will-redirect', (details) => {
    if (!checkNavigationUrl(details.url).allowed) details.preventDefault();
  });

  // `target="_blank"`/`window.open` never spawn a BrowserWindow, managed or
  // otherwise, and — unlike the browser's tabs — never re-open inside this
  // app's own view either: these are single-surface embeds, not a tab
  // model, so an allowed request goes straight to the system browser.
  wc.setWindowOpenHandler(({ url: requestedUrl }) => {
    if (checkNavigationUrl(requestedUrl).allowed) void shell.openExternal(requestedUrl);
    return { action: 'deny' };
  });

  wc.on('certificate-error', (event, url) => {
    event.preventDefault();
    defaultLogger(`[apps] certificate error, refused: app=${id} url=${url}`);
  });

  view.setVisible(true);
  void wc.loadURL(definition.launchUrl);
}

/**
 * Disable an app: tear down its view only. The partition's on-disk session
 * data (cookies, localStorage, the logged-in state) is untouched — durability
 * lives in Electron's session-partition store, not in this view instance's
 * lifetime, so re-enabling later restores the same session.
 */
export function disableApp(id: AppId): void {
  discardedApps.delete(id);
  hiddenSince.delete(id);
  lastBounds.delete(id);

  const tracked = apps.get(id);
  if (!tracked) return;
  apps.delete(id);
  if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
  if (!tracked.view.webContents.isDestroyed()) {
    tracked.view.webContents.removeAllListeners();
    tracked.view.webContents.close();
  }
}

/**
 * Which enabled app is on top in `win`'s flyout (Theme C) — mirrors
 * `activateBrowserTab`'s "only one view is ever attached-and-visible PER
 * WINDOW" rule, scoped to this module's own map rather than `browser-service`'s.
 *
 * `id: null` means "nothing is active" — hides every app tracked against
 * `win` rather than resolving a target from `apps.get(id)` the way a plain
 * `AppId` would. That is also why this takes `win` explicitly rather than
 * deriving it from the activating app the way the old single-`AppId` form
 * did: `apps-handlers.ts` always resolves `win` to `getMainWindow()` (the
 * flyout is a main-window-only surface), and a `null` id has no app of its
 * own to read a window out of.
 */
export function activateApp(win: BrowserWindow, id: AppId | null): void {
  if (id !== null && discardedApps.has(id)) {
    const saved = discardedApps.get(id);
    discardedApps.delete(id);
    enableApp(win, id);
    if (saved?.bounds) setAppBounds(id, saved.bounds);
  }

  const now = Date.now();
  for (const [otherId, tracked] of apps) {
    if (tracked.win === win) {
      const isVisible = id !== null && otherId === id;
      tracked.view.setVisible(isVisible);
      if (isVisible) {
        hiddenSince.delete(otherId);
      } else if (!hiddenSince.has(otherId)) {
        hiddenSince.set(otherId, now);
      }
    }
  }
}

/**
 * Move one app's `WebContentsView` to `next` (Phase 83 Theme D) — detaching or
 * re-docking it. Mirrors `reparentBrowserTabs`: the view keeps its
 * `webContents`, so its partition, navigation history and in-page state all
 * survive by construction — no `loadURL`, no `setWindowOpenHandler`
 * re-registration. Unlike the browser (which moves every tab together), each
 * app has its own literal role and moves independently — Spotify detaching
 * must never touch Calendar's window.
 *
 * Visibility is set explicitly rather than left to whatever it was before the
 * move: a popout hosts exactly one app, so it is always shown there; docking
 * back to a window that may already have a different app active in its
 * flyout leaves it hidden, and the next `apps.activate` (a rail click, or
 * `use-window-sync.ts`'s reconciliation) is what decides which one shows.
 */
export function reparentAppView(id: AppId, next: BrowserWindow, opts?: { visible?: boolean }): void {
  const tracked = apps.get(id);
  if (!tracked) return;
  if (tracked.win !== next) {
    if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
    if (!next.isDestroyed()) next.contentView.addChildView(tracked.view);
    apps.set(id, { view: tracked.view, win: next });
  }
  tracked.view.setVisible(opts?.visible ?? true);
}

/**
 * Bounds arrive in CSS pixels; `WebContentsView.setBounds` wants device
 * pixels — the same zoom-factor scaling `setBrowserBounds` does, for the
 * identical reason: the renderer measures in CSS pixels and may not import
 * `electron`, so it has no legal way to read the window's zoom factor.
 */
export function setAppBounds(id: AppId, bounds: BrowserBounds): void {
  lastBounds.set(id, bounds);
  const tracked = apps.get(id);
  if (!tracked) return;
  const factor = tracked.win.webContents.getZoomFactor();
  tracked.view.setBounds({
    x: Math.round(bounds.x * factor),
    y: Math.round(bounds.y * factor),
    width: Math.round(bounds.width * factor),
    height: Math.round(bounds.height * factor),
  });
}

/**
 * Pure policy for whether a third-party app is eligible for idle discard
 * (Phase 84 Theme F.4).
 *
 * Third-party apps are excluded by default (Spotify playing music in the
 * background is the canonical case). An app is eligible only if:
 * 1. The user explicitly opted IN to idle discard for this specific app
 * 2. It is not effectively visible (not active in its window's flyout, or window hidden/minimized)
 * 3. It is not currently playing audio (`audible === false`)
 * 4. The threshold is > 0 and the app has been hidden for at least `discardMs`
 */
export function isAppDiscardEligible(input: {
  effectiveVisible: boolean;
  audible: boolean;
  discardOptIn: boolean;
  hiddenSinceMs: number | undefined;
  now: number;
  discardMs: number;
}): boolean {
  const { effectiveVisible, audible, discardOptIn, hiddenSinceMs, now, discardMs: threshold } = input;
  if (!discardOptIn) return false;
  if (effectiveVisible || audible) return false;
  if (threshold <= 0) return false;
  if (hiddenSinceMs === undefined) return false;
  return now - hiddenSinceMs >= threshold;
}

/**
 * Discard an app: tear down its WebContentsView and renderer process while
 * remembering it was enabled, so the next `activateApp` transparently restores it.
 */
export function discardApp(id: AppId): void {
  const tracked = apps.get(id);
  if (!tracked) return;
  discardedApps.set(id, { win: tracked.win, bounds: lastBounds.get(id) });
  apps.delete(id);
  hiddenSince.delete(id);
  if (!tracked.win.isDestroyed()) tracked.win.contentView.removeChildView(tracked.view);
  if (!tracked.view.webContents.isDestroyed()) {
    tracked.view.webContents.removeAllListeners();
    tracked.view.webContents.close();
  }
  defaultLogger(`[apps] app discarded to free memory: app=${id}`);
}

/**
 * One pass over every enabled app: check if any has aged past the discard
 * threshold with opt-in enabled.
 */
export function runAppsDiscardSweep(): void {
  const now = Date.now();
  const settings = currentSettings();
  const discardMs = settings.browserDiscardMs ?? 10 * 60 * 1000;
  const optInMap = settings.appDiscardIdle ?? {};

  for (const [id, tracked] of apps) {
    const { win, view } = tracked;
    if (win.isDestroyed() || view.webContents.isDestroyed()) continue;
    const effectiveVisible = view.isVisible() && win.isVisible() && !win.isMinimized();

    if (effectiveVisible) {
      hiddenSince.delete(id);
      continue;
    }
    if (!hiddenSince.has(id)) hiddenSince.set(id, now);

    const eligible = isAppDiscardEligible({
      effectiveVisible,
      audible: view.webContents.isCurrentlyAudible(),
      discardOptIn: Boolean(optInMap[id]),
      hiddenSinceMs: hiddenSince.get(id),
      now,
      discardMs,
    });
    if (eligible) discardApp(id);
  }
}

/** Start the periodic idle discard sweep. */
export function startAppsDiscardSweep(intervalMs = 60_000): void {
  if (appsDiscardSweepTimer) return;
  appsDiscardSweepTimer = setInterval(runAppsDiscardSweep, intervalMs);
  appsDiscardSweepTimer.unref?.();
}

/** Stop the periodic idle discard sweep. */
export function stopAppsDiscardSweep(): void {
  if (appsDiscardSweepTimer) clearInterval(appsDiscardSweepTimer);
  appsDiscardSweepTimer = null;
}

/** Query whether an app is currently in a discarded (sleeping) state. */
export function isAppDiscarded(id: AppId): boolean {
  return discardedApps.has(id);
}

/** Window close, `before-quit`: destroy every tracked app view — nothing survives past the process. */
export function destroyAllApps(): void {
  stopAppsDiscardSweep();
  for (const [id] of apps) disableApp(id);
}

/** Test-only: drop every tracked app without tearing down real Electron state. */
export function resetAppsServiceForTests(): void {
  apps.clear();
  securedPartitions.clear();
  hiddenSince.clear();
  discardedApps.clear();
  lastBounds.clear();
  stopAppsDiscardSweep();
}

