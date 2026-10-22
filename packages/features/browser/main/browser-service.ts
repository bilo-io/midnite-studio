import { homedir } from 'node:os';

import {
  DEFAULT_BROWSER_DISCARD_MS,
  EVENT_CHANNELS,
  type BrowserAgentSessionState,
  type BrowserAgentToolCall,
  type BrowserAgentToolResult,
  type PageSafetyLevel,
  type BrowserBounds,
  type BrowserEvent,
  type BrowserPermissionKind,
  type BrowserPermissionRecord,
  type CommandId,
  siteVerdictLevel,
  type SiteKnownBad,
} from '@midnite/studio-shared';

import type { BrowserHostWindow as BrowserWindow, BrowserInput as Input, BrowserView as WebContentsView } from './browser-electron';
import { browserMainDeps, defaultLogger } from './browser-main-deps';
import { checkNavigationUrl } from './browser-security';
import { applyBrowserSessionPolicy, refuseWebviewAttach, sandboxedPageWebPreferences } from './browser-session-policy';
import {
  bypassInterstitial,
  installVerdictEmitter,
  isCertificateBypassed,
  knownBadRefusal,
  type InterstitialKind,
  recordCertificateVerification,
  resetSiteSafetyForTests,
  siteVerdicts,
} from './browser-site-safety';
import { createDownloadHandler } from './browser-downloads';
import {
  createNodeQuarantineDeps,
  defaultQuarantineFolder,
  ensureQuarantineFolder,
  getDownloadsSettings,
  getPrivacySettings,
  isTrackerExcepted,
  pathExists,
  setDownloadsSettings,
  setPrivacySettings,
  setTrackerException,
} from './browser-protection';
import { bundledFilterList, createUserAgentController, type PrivacySettings } from './browser-request-filter';
import { EASYPRIVACY_RULES } from './data/easyprivacy.generated';
import { formatOriginForDisplay } from './idn-hygiene';
import { createBrowserAgentSessions, type AgentWebContents, type BrowserAgentSessions } from './browser-agent-session';
import { createClipboardWatch, PAGE_INTERACTION_WINDOW_MS, type ClipboardWatch } from './clipboard-watch';
import { createPermissionGrantStore, type PermissionGrantStore } from './permission-grant-store';

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
/** `devTools` is what the view was *created* with (Phase 117 Theme A) — the only value `openDevTools` honours. */
type Tracked = { view: WebContentsView; win: BrowserWindow; devTools: boolean };

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
 * Maps OS renderer PIDs of active browser tabs to human-readable tab descriptions
 * (Phase 85 Theme E).
 */
export function getBrowserTabOwners(): Map<number, string> {
  const result = new Map<number, string>();
  for (const [tabId, tracked] of tabs) {
    if (!tracked.view.webContents.isDestroyed()) {
      try {
        const pid = tracked.view.webContents.getOSProcessId();
        if (pid > 0) {
          const title = tracked.view.webContents.getTitle()?.trim();
          const url = tracked.view.webContents.getURL()?.trim();
          const label = title || url || tabId;
          result.set(pid, `Tab: ${label}`);
        }
      } catch {
        // webContents destroyed
      }
    }
  }
  return result;
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
  browserMainDeps().electron.onDisplayMetricsChanged(() => {
    const windows = new Set([...tabs.values()].map((tracked) => tracked.win));
    for (const win of windows) reapplyBoundsForWindow(win);
  });
}

let securityConfigured = false;
let permissionStoreInstance: PermissionGrantStore | null = null;

export function getBrowserPermissionStore(): PermissionGrantStore {
  const deps = browserMainDeps();
  if (deps.permissionStore) return deps.permissionStore;
  if (!permissionStoreInstance) {
    permissionStoreInstance = createPermissionGrantStore({ directory: deps.userDataPath });
  }
  return permissionStoreInstance;
}

export function resetBrowserPermissionStoreForTest(): void {
  permissionStoreInstance = null;
  securityConfigured = false;
  pendingPermissionRequests.clear();
  pendingDownloadRequests.clear();
  trackerBlocks.clear();
  applyUserAgent = null;
}

type PendingPermissionPrompt = {
  tabId: string;
  origin: string;
  permissions: BrowserPermissionKind[];
  callback: (granted: boolean) => void;
};

const pendingPermissionRequests = new Map<string, PendingPermissionPrompt>();

/** Phase 117 Theme D — downloads waiting on the user's confirm. */
const pendingDownloadRequests = new Map<string, { tabId: string; resolve: (allow: boolean) => void }>();

export function resolveBrowserDownload(requestId: string, decision: 'allow' | 'deny'): void {
  const pending = pendingDownloadRequests.get(requestId);
  if (!pending) return;
  pendingDownloadRequests.delete(requestId);
  pending.resolve(decision === 'allow');
}

/** Phase 117 Theme E — blocked third-party requests per tab, for the address-bar counter. */
const trackerBlocks = new Map<string, { count: number; hosts: Set<string>; timer?: ReturnType<typeof setTimeout> }>();

function tabForContents(webContents: unknown): [string, { win: BrowserWindow; view: WebContentsView }] | undefined {
  return [...tabs.entries()].find(([, t]) => t.view.webContents === webContents) as
    | [string, { win: BrowserWindow; view: WebContentsView }]
    | undefined;
}

/**
 * Theme D's `originVerdict` seam: the worst site verdict any open tab holds for `origin`, so a page
 * the badge shows as `danger` (a certificate proceeded past, a feed hit) cannot hand out a download.
 * `undefined` when no tab has committed that origin — the policy then judges the file alone.
 */
export function originVerdictLevel(origin: string): 'safe' | 'caution' | 'danger' | undefined {
  let worst: 'safe' | 'caution' | 'danger' | undefined;
  for (const tabId of tabs.keys()) {
    const verdict = siteVerdicts().verdict(tabId);
    if (!verdict || verdict.origin !== origin) continue;
    const level = siteVerdictLevel(verdict);
    if (level === 'danger') return 'danger';
    if (level === 'caution' || worst === undefined) worst = level === 'ok' ? 'safe' : level;
  }
  return worst;
}

/** The count reaches the renderer on the tab's `SiteVerdict` — one badge (Theme C), no event of its own. */
function flushTrackerBlocks(tabId: string): void {
  const entry = trackerBlocks.get(tabId);
  if (!entry || !tabs.has(tabId)) return;
  entry.timer = undefined;
  siteVerdicts().setTrackerBlocks(tabId, entry.count, [...entry.hosts]);
}

function recordTrackerBlock(webContents: unknown, host: string): void {
  const found = tabForContents(webContents);
  if (!found) return;
  const tabId = found[0];
  const entry = trackerBlocks.get(tabId) ?? { count: 0, hosts: new Set<string>() };
  trackerBlocks.set(tabId, entry);
  entry.count += 1;
  if (entry.hosts.size < 200) entry.hosts.add(host);
  // Trailing throttle: a tracker-heavy page blocks hundreds of requests in a burst.
  if (entry.timer === undefined) {
    entry.timer = setTimeout(() => flushTrackerBlocks(tabId), 150);
    (entry.timer as { unref?: () => void }).unref?.();
  }
}

function resetTrackerBlocks(tabId: string): void {
  const entry = trackerBlocks.get(tabId);
  if (!entry) return;
  if (entry.timer !== undefined) clearTimeout(entry.timer);
  // No push: the navigation that resets the counter commits a fresh verdict, which starts at zero.
  trackerBlocks.delete(tabId);
}

let applyUserAgent: ((reduce: boolean) => void) | null = null;

export function setBrowserPrivacy(next: PrivacySettings): void {
  setPrivacySettings(next);
  applyUserAgent?.(next.reduceUserAgent);
}

export function setBrowserDownloads(next: { enabled: boolean; folder?: string }): void {
  setDownloadsSettings({ enabled: next.enabled, folder: next.folder ?? '' });
}

export function setBrowserTrackerException(host: string, allow: boolean): void {
  setTrackerException(host, allow, browserMainDeps().userDataPath);
}

export function cancelPendingPermissionRequestsForTab(tabId: string): void {
  for (const [requestId, pending] of pendingDownloadRequests) {
    if (pending.tabId === tabId) {
      pendingDownloadRequests.delete(requestId);
      pending.resolve(false);
    }
  }
  for (const [requestId, pending] of pendingPermissionRequests) {
    if (pending.tabId === tabId) {
      pending.callback(false);
      pendingPermissionRequests.delete(requestId);
    }
  }
}

export function resolveBrowserPermission(
  requestId: string,
  decision: 'allow' | 'deny' | 'dismiss',
): void {
  const pending = pendingPermissionRequests.get(requestId);
  if (!pending) return;
  pendingPermissionRequests.delete(requestId);
  const store = getBrowserPermissionStore();
  if (decision === 'allow') {
    for (const perm of pending.permissions) {
      store.set(pending.origin, perm, 'allow');
    }
    pending.callback(true);
  } else if (decision === 'deny') {
    for (const perm of pending.permissions) {
      store.set(pending.origin, perm, 'deny');
    }
    pending.callback(false);
  } else {
    pending.callback(false);
  }
}

export function listBrowserPermissions(): BrowserPermissionRecord[] {
  return getBrowserPermissionStore().list();
}

export function revokeBrowserPermission(origin: string, permission: string): void {
  getBrowserPermissionStore().revoke(origin, permission);
}

export function resetAllBrowserPermissions(): void {
  getBrowserPermissionStore().resetAll();
}

export function setBrowserSpellcheck(enabled: boolean): void {
  browserMainDeps().electron.sessionFromPartition(PARTITION).setSpellCheckerEnabled(enabled);
}

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
  installVerdictEmitter((tabId, verdict) => {
    const tracked = tabs.get(tabId);
    if (tracked) send(tracked.win, { kind: 'verdict', tabId, verdict });
  });
  // Phase 117 Theme C ↔ G: a page the agent reads carries the tab's site verdict as its level.
  setBrowserAgentSiteLevelSource(agentSiteLevelFromVerdict);
  // Phase 117 Theme B: permission prompts remembered per origin via PermissionGrantStore.
  const store = getBrowserPermissionStore();
  const session = browserMainDeps().electron.sessionFromPartition(PARTITION);
  const deps = browserMainDeps();
  applyBrowserSessionPolicy(session, {
    permissionStore: store,
    // Phase 117 Theme G: while an agent session drives a tab, its requests stay on the allowlist.
    requestGate: (details) => browserAgentSessions().egressGate(details),
    // Phase 117 Theme G: a page's `midnite-studio://`/`midnite://` link, refused here, confirmed by the host.
    onMidniteLink: (url, origin, webContents) => {
      if (browserAgentSessions().activeFor(webContents)) {
        // An agent-driven page never gets to hand the user a run or a clone, even a confirmed one.
        defaultLogger(`[browser] a midnite link from an agent-driven page was dropped (${origin})`);
        return;
      }
      browserMainDeps().onPageDeepLink?.(url, origin);
    },
    // Phase 117 Theme E: tracker/cookie/referrer rules on this partition only (web apps are exempt).
    requestFilter: {
      getSettings: getPrivacySettings,
      isExcepted: (domain) => isTrackerExcepted(domain, deps.userDataPath),
      onBlocked: (webContents, host) => recordTrackerBlock(webContents, host),
      loadList: () => bundledFilterList(EASYPRIVACY_RULES),
    },
    // Phase 117 Theme D: opt-in, quarantined downloads; the handler cancels itself while off.
    downloadHandler: createDownloadHandler({
      getSettings: getDownloadsSettings,
      originVerdict: originVerdictLevel,
      defaultFolder: defaultQuarantineFolder(),
      quarantine: createNodeQuarantineDeps(deps.userDataPath),
      ensureFolder: ensureQuarantineFolder,
      exists: pathExists,
      pageUrlOf: (wc) => (wc as { getURL?(): string } | undefined)?.getURL?.() ?? '',
      // Phase 117 Theme G: no download behind the user's back while an agent drives the page.
      forceConfirm: (wc) => browserAgentSessions().activeFor(wc),
      confirm: ({ webContents, filename, size, origin, fileClass }) =>
        browserAgentSessions().activeFor(webContents)
          ? browserAgentSessions().askUser(webContents, 'download', `The page wants to download ${filename} from ${origin || 'this site'}.`)
          : new Promise<boolean>((resolve) => {
              const entry = tabForContents(webContents);
              if (!entry || entry[1].win.isDestroyed()) {
                resolve(false);
                return;
              }
              const requestId = crypto.randomUUID();
              pendingDownloadRequests.set(requestId, { tabId: entry[0], resolve });
              send(entry[1].win, { kind: 'download-request', tabId: entry[0], requestId, filename, size, origin, fileClass });
            }),
      onRefused: (webContents, filename, reason) => {
        defaultLogger(`[browser] download refused: ${filename}${reason ? ` (${reason})` : ''}`);
        const entry = tabForContents(webContents);
        if (entry) send(entry[1].win, { kind: 'download-blocked', tabId: entry[0], filename, ...(reason ? { reason } : {}) });
      },
      onDone: (webContents, record) => {
        const entry = tabForContents(webContents);
        if (entry) {
          send(entry[1].win, {
            kind: 'download-done',
            tabId: entry[0],
            filename: record.filename,
            path: record.path,
            sha256: record.sha256,
            quarantined: record.quarantined,
            ...(record.gatekeeper ? { gatekeeper: record.gatekeeper } : {}),
            ...(record.scan ? { scan: record.scan } : {}),
          });
        }
      },
      log: (m) => defaultLogger(m),
    }),
    onPermissionRequest: ({ origin, permission, permissions, webContents, callback }) => {
      const entry = [...tabs.entries()].find(([, t]) => t.view.webContents === webContents);
      if (!entry || entry[1].win.isDestroyed()) {
        callback(false);
        return;
      }
      const tabId = entry[0];
      const requestId =
        typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const displayName = formatOriginForDisplay(origin);
      pendingPermissionRequests.set(requestId, {
        tabId,
        origin,
        permissions,
        callback,
      });
      send(entry[1].win, {
        kind: 'permission-request',
        tabId,
        requestId,
        origin,
        permission,
        displayName,
      });
    },
    onDownloadRefused: (filename, webContents) => {
      // Session-level, so the item arrives with the `webContents` that asked
      // for it rather than a tab id — reverse-lookup so the notice lands on
      // the tab the user was actually looking at.
      const entry = [...tabs.entries()].find(([, t]) => t.view.webContents === webContents);
      defaultLogger(`[browser] download refused: ${filename}`);
      if (entry) send(entry[1].win, { kind: 'download-blocked', tabId: entry[0], filename });
    },
    // Phase 117 Theme C: TLS results per host, and every completed request for the verdict.
    onCertificateVerified: recordCertificateVerification,
    onRequestCompleted: (details) => siteVerdicts().requestCompleted(details),
  });
  // Phase 117 Theme E: a reduced User-Agent (new pages; an open page keeps the one it started with).
  applyUserAgent = createUserAgentController(session);
  applyUserAgent(getPrivacySettings().reduceUserAgent);
}

// --- the page-to-agent boundary (Phase 117 Theme G) -------------------------

let agentSessions: BrowserAgentSessions | null = null;
let agentSiteLevelSource: ((contents: unknown) => Exclude<PageSafetyLevel, 'unknown'> | undefined) | null = null;

/**
 * The seam Theme C's site verdict plugs into: given a tab's `webContents`, the level of the page it
 * shows. Until it is wired, a page read by the agent carries `unknown` (raised to `caution` by an
 * injection hit), and nothing here depends on Theme C's code.
 */
export function setBrowserAgentSiteLevelSource(
  source: ((contents: unknown) => Exclude<PageSafetyLevel, 'unknown'> | undefined) | null,
): void {
  agentSiteLevelSource = source;
}

/** Theme C's verdict for the page in `contents`, as the level an agent-read page carries. */
export function agentSiteLevelFromVerdict(contents: unknown): Exclude<PageSafetyLevel, 'unknown'> | undefined {
  const id = (contents as { id?: unknown } | null)?.id;
  const verdict = typeof id === 'number' ? siteVerdicts().verdictForWebContents(id) : undefined;
  return verdict ? siteVerdictLevel(verdict) : undefined;
}

function browserAgentSessions(): BrowserAgentSessions {
  if (!agentSessions) {
    agentSessions = createBrowserAgentSessions({
      contentsFor: (tabId) => {
        const wc = tabs.get(tabId)?.view.webContents;
        return wc && !wc.isDestroyed() ? (wc as unknown as AgentWebContents) : null;
      },
      emit: (tabId, state) => {
        const tab = tabs.get(tabId);
        if (tab) send(tab.win, { kind: 'agent-session', tabId, state });
      },
      siteLevel: (contents) => agentSiteLevelSource?.(contents),
      homeDir: homedir(),
    });
  }
  return agentSessions;
}

export function startBrowserAgent(input: { tabId: string; goal: string; allowlist: readonly string[] }):
  | { ok: true; state: BrowserAgentSessionState }
  | { ok: false; message: string } {
  if (!tabs.has(input.tabId)) return { ok: false, message: 'Open a page first.' };
  ensureSessionConfigured();
  return browserAgentSessions().start(input);
}

export function stopBrowserAgent(sessionId: string): void {
  agentSessions?.stop(sessionId);
}

export function runBrowserAgentTool(sessionId: string, call: BrowserAgentToolCall): Promise<BrowserAgentToolResult> {
  return browserAgentSessions().runTool(sessionId, call);
}

export function respondBrowserAgent(sessionId: string, pendingId: string, decision: 'allow' | 'deny'): void {
  agentSessions?.respond(sessionId, pendingId, decision);
}

/** The user drove the tab themselves (address bar, back, forward): the agent lets go. */
function userTookTheWheel(tabId: string): void {
  agentSessions?.endForTab(tabId, 'You took the wheel');
}

// ClickFix: the clipboard watch. On by default; `Settings ▸ Browser` mirrors the switch here.
let clipboardWatchEnabled = true;
let clipboardWatch: ClipboardWatch | null = null;
/** The last tab the user focused or typed into, and when. One entry, not a per-tab map. */
let lastPageInteraction: { tabId: string; at: number } | null = null;

function notePageInteraction(tabId: string): void {
  lastPageInteraction = { tabId, at: Date.now() };
}

function pageOrigin(tabId: string): string {
  try {
    return new URL(tabs.get(tabId)?.view.webContents.getURL() ?? '').origin;
  } catch {
    return '';
  }
}

function ensureClipboardWatch(): void {
  const electron = browserMainDeps().electron;
  const readText = electron.readClipboardText;
  if (!readText) return;
  if (clipboardWatch) {
    if (clipboardWatchEnabled) clipboardWatch.start();
    return;
  }
  clipboardWatch = createClipboardWatch({
    readText: () => readText.call(electron),
    // Only while a window hosting a browser tab has focus — never a background clipboard monitor.
    isActive: () => clipboardWatchEnabled && [...tabs.values()].some((t) => !t.win.isDestroyed() && t.win.isFocused?.() === true),
    recentPageInteraction: () => {
      for (const [tabId, t] of tabs) {
        if (!t.view.webContents.isDestroyed() && t.view.webContents.isFocused?.() === true) return { tabId, origin: pageOrigin(tabId) };
      }
      const last = lastPageInteraction;
      if (!last || !tabs.has(last.tabId) || Date.now() - last.at > PAGE_INTERACTION_WINDOW_MS) return null;
      return { tabId: last.tabId, origin: pageOrigin(last.tabId) };
    },
    onHit: ({ tabId, origin, match, preview }) => {
      const tab = tabs.get(tabId);
      defaultLogger(`[browser] clickfix: ${match.reason} on the clipboard after ${origin || 'a page'}`);
      if (tab) send(tab.win, { kind: 'clipboard-warning', tabId, origin, label: match.label.slice(0, 120), preview: preview.slice(0, 96) });
    },
  });
  if (clipboardWatchEnabled) clipboardWatch.start();
}

export function setBrowserClipboardWatch(enabled: boolean): void {
  clipboardWatchEnabled = enabled;
  if (!enabled) clipboardWatch?.stop();
  else if (tabs.size > 0) ensureClipboardWatch();
}

/** The ClickFix bar's one-click clear. */
export function clearBrowserClipboard(): void {
  const electron = browserMainDeps().electron;
  electron.clearClipboard?.call(electron);
}

/** Test seam: run one clipboard poll now. */
export function tickBrowserClipboardWatchForTests(): void {
  clipboardWatch?.tick();
}

/**
 * What each tab's interstitial (Phase 117 Theme C) refused — `proceedBrowserSite` lifts only that
 * URL, and only for that reason, so a renderer cannot ask main to bypass something the user was
 * never warned about.
 */
const interstitialUrls = new Map<string, { url: string; kind: InterstitialKind }>();

/** `net::ERR_BLOCKED_BY_CLIENT` — the honest Chromium code for "this app refused it". */
export const KNOWN_BAD_ERROR_CODE = -20;

/** Chromium's certificate errors are `-200`…`-299` (`net/base/net_error_list.h`). */
export function isCertificateErrorCode(code: number): boolean {
  return code <= -200 && code >= -299;
}

/**
 * Show the known-bad interstitial instead of loading `url` — before a byte of the page arrives, so
 * nothing paints. No verdict is committed: nothing navigated, so the tab's verdict still belongs to
 * whatever page it shows (or none), and the interstitial is what speaks for the refused URL.
 */
function refuseKnownBad(win: BrowserWindow, tabId: string, url: string, hit: SiteKnownBad): void {
  interstitialUrls.set(tabId, { url, kind: { reason: 'known-bad', match: hit.match } });
  defaultLogger(`[browser] known-bad (${hit.feed}) refused: ${url}`);
  send(win, {
    kind: 'failed',
    tabId,
    error: {
      code: KNOWN_BAD_ERROR_CODE,
      description: `Listed as ${hit.category} by ${hit.feed === 'urlhaus' ? 'URLhaus' : 'OpenPhish'}`,
      validatedUrl: url,
      reason: 'known-bad',
      knownBad: hit,
    },
  });
}

/** Load `url` in a tab unless a reputation feed lists it. */
function loadUnlessKnownBad(tracked: Tracked, tabId: string, url: string): void {
  const hit = knownBadRefusal(url);
  if (hit) {
    refuseKnownBad(tracked.win, tabId, url, hit);
    return;
  }
  void tracked.view.webContents.loadURL(url);
}

/**
 * "Proceed for this session" from an interstitial (Phase 117 Theme C). Honoured only when the
 * Settings ▸ Browser switch is on and `url` is the one this tab's interstitial refused; the bypass
 * covers that host until the app quits. Decision 8: never while an agent session drives the tab
 * (Theme G) — the user takes the wheel first, which ends the session, and then decides.
 */
export function proceedBrowserSite(tabId: string, url: string): void {
  const tracked = tabs.get(tabId);
  const refused = interstitialUrls.get(tabId);
  if (!tracked || !refused || refused.url !== url) return;
  if (agentSessions?.activeFor(tracked.view.webContents)) {
    defaultLogger(`[browser] proceed refused (an agent session drives this tab): ${url}`);
    return;
  }
  if (!bypassInterstitial(url, refused.kind)) {
    defaultLogger(`[browser] proceed refused (switch off): ${url}`);
    return;
  }
  interstitialUrls.delete(tabId);
  defaultLogger(`[browser] user proceeded past interstitial for this session: ${url}`);
  void tracked.view.webContents.loadURL(url);
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

  // No preload: an embedded page must have no path to window.midniteStudio,
  // and the cheapest way to guarantee that is to hand it nothing — the table
  // is pinned by `web-preferences.test.ts` (Phase 117 Theme A).
  const devTools = browserMainDeps().devToolsAllowed ?? false;
  const view = browserMainDeps().electron.createView({
    webPreferences: sandboxedPageWebPreferences(PARTITION, { devTools }),
  });

  win.contentView.addChildView(view);
  markViewVisible(tabId, view, false);
  tabs.set(tabId, { view, win, devTools });
  ensureFullScreenReapply(win);
  ensureDisplayMetricsReapply();

  const wc = view.webContents;
  refuseWebviewAttach(wc);
  siteVerdicts().bind(tabId, wc.id);
  ensureClipboardWatch();
  // Phase 117 Theme G: the ClickFix watch only counts a clipboard change the user's page time explains.
  wc.on('focus', () => notePageInteraction(tabId));

  wc.on('did-navigate', (_event, navigatedUrl) => {
    cancelPendingPermissionRequestsForTab(tabId);
    interstitialUrls.delete(tabId);
    resetTrackerBlocks(tabId);
    send(win, {
      kind: 'navigated',
      tabId,
      url: navigatedUrl,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
    // A main-frame commit: a fresh SiteVerdict (Phase 117 Theme C). In-page navigations keep theirs.
    siteVerdicts().commit(tabId, navigatedUrl);
  });
  wc.on('did-navigate-in-page', (_event, navigatedUrl) => {
    cancelPendingPermissionRequestsForTab(tabId);
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
    const certificate = isCertificateErrorCode(errorCode);
    if (certificate) interstitialUrls.set(tabId, { url: validatedUrl, kind: { reason: 'certificate' } });
    send(win, {
      kind: 'failed',
      tabId,
      error: {
        code: errorCode,
        description: errorDescription,
        validatedUrl,
        ...(certificate ? { reason: 'certificate' as const } : {}),
      },
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
    notePageInteraction(tabId);
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
    cancelPendingPermissionRequestsForTab(tabId);
    const check = checkNavigationUrl(details.url);
    if (check.allowed) {
      const hit = knownBadRefusal(details.url);
      if (hit) {
        details.preventDefault();
        refuseKnownBad(win, tabId, details.url, hit);
      }
      return;
    }
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
    if (!checkNavigationUrl(details.url).allowed) {
      details.preventDefault();
      return;
    }
    // A subframe's redirect (an ad iframe bouncing to a listed URL) must not raise the full-tab
    // interstitial over the page the user is on; Chromium's own subframe handling stands.
    if (details.isMainFrame === false) return;
    const hit = knownBadRefusal(details.url);
    if (hit) {
      details.preventDefault();
      refuseKnownBad(win, tabId, details.url, hit);
    }
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

  // Rejected unless the user proceeded past this host's interstitial this session (Phase 117
  // Theme C) — the failed load then arrives on `did-fail-load` with Chromium's -2xx code and the
  // renderer shows the certificate interstitial. `preventDefault` keeps the app-level
  // `certificate-error` (global, every partition) out of this decision; the callback must then be
  // answered explicitly, or the request would hang instead of failing.
  wc.on('certificate-error', (event, certUrl, error, _certificate, callback, isMainFrame) => {
    event.preventDefault();
    if (isCertificateBypassed(certUrl)) {
      callback?.(true);
      return;
    }
    callback?.(false);
    defaultLogger(`[browser] certificate error (${error}), refused${isMainFrame ? '' : ' subresource'}: ${certUrl}`);
  });

  loadUnlessKnownBad(tabs.get(tabId)!, tabId, url);
}

export function closeBrowserTab(tabId: string): void {
  agentSessions?.endForTab(tabId, 'The tab closed');
  if (lastPageInteraction?.tabId === tabId) lastPageInteraction = null;
  cancelPendingPermissionRequestsForTab(tabId);
  trackerBlocks.delete(tabId);
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  tabs.delete(tabId);
  interstitialUrls.delete(tabId);
  siteVerdicts().forget(tabId);
  if (tabs.size === 0) clipboardWatch?.stop();
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
  agentSessions?.endForTab(tabId, 'The tab was put to sleep');
  if (lastPageInteraction?.tabId === tabId) lastPageInteraction = null;
  cancelPendingPermissionRequestsForTab(tabId);
  trackerBlocks.delete(tabId);
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  tabs.delete(tabId);
  hiddenSince.delete(tabId);
  visibleTabIds.delete(tabId);
  interstitialUrls.delete(tabId);
  siteVerdicts().forget(tabId);
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
  userTookTheWheel(tabId);
  loadUnlessKnownBad(tracked, tabId, url);
}

export function backBrowserTab(tabId: string): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.navigationHistory.canGoBack()) {
    userTookTheWheel(tabId);
    wc.navigationHistory.goBack();
  }
}

export function forwardBrowserTab(tabId: string): void {
  const wc = tabs.get(tabId)?.view.webContents;
  if (wc?.navigationHistory.canGoForward()) {
    userTookTheWheel(tabId);
    wc.navigationHistory.goForward();
  }
}

export function reloadBrowserTab(tabId: string): void {
  tabs.get(tabId)?.view.webContents.reload();
}

export function stopBrowserTab(tabId: string): void {
  tabs.get(tabId)?.view.webContents.stop();
}

export function toggleBrowserDevTools(tabId: string, mode: 'detach' | 'embed' = 'detach'): void {
  const tracked = tabs.get(tabId);
  if (!tracked) return;
  const wc = tracked.view.webContents;
  // The view was created with `devTools: false` (Phase 117 Theme A): `openDevTools` would do nothing.
  // Decided from what the view was built with, not what the deps say now — the two can differ.
  if (!tracked.devTools) {
    send(tracked.win, { kind: 'devtools-blocked', tabId });
    return;
  }
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
    tabs.set(tabId, { ...tracked, win: next });
  }
}

export async function clearBrowserData(): Promise<void> {
  const browserSession = browserMainDeps().electron.sessionFromPartition(PARTITION);
  await browserSession.clearStorageData();
  await browserSession.clearCache();
}

/** Window close, `before-quit`: destroy every tracked view — nothing survives past the process. */
export function destroyAllBrowserTabs(): void {
  for (const [tabId] of tabs) closeBrowserTab(tabId);
}

/** Test-only: drop every tracked tab without tearing down real Electron state. */
/**
 * Every per-tab collection this module keeps, in ONE place (Phase 91 Theme F). A tab that is
 * closed must leave none of them behind; `browser-service.leak.test.ts` asserts all are empty
 * after close and compares this list's keys against its own, so a sixth collection added here
 * without a matching `delete` in {@link closeBrowserTab} fails that test.
 */
const trackedCollections = { tabs, lastBounds, hiddenSince, keepAwakeTabIds, visibleTabIds, interstitialUrls };

/** Test seam: the size of every per-tab collection, keyed by name. */
export function trackedStateSizes(): Record<keyof typeof trackedCollections, number> {
  const sizes = {} as Record<keyof typeof trackedCollections, number>;
  for (const [name, collection] of Object.entries(trackedCollections)) {
    sizes[name as keyof typeof trackedCollections] = collection.size;
  }
  return sizes;
}

export function resetBrowserServiceForTests(): void {
  tabs.clear();
  lastBounds.clear();
  securityConfigured = false;
  displayMetricsReapplyWired = false;
  hiddenSince.clear();
  keepAwakeTabIds.clear();
  visibleTabIds.clear();
  interstitialUrls.clear();
  resetSiteSafetyForTests();
  discardMs = DEFAULT_BROWSER_DISCARD_MS;
  stopBrowserDiscardSweep();
  agentSessions = null;
  agentSiteLevelSource = null;
  clipboardWatch?.stop();
  clipboardWatch = null;
  clipboardWatchEnabled = true;
  lastPageInteraction = null;
}
