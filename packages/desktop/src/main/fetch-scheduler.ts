import { fetch as gitFetch, listRefs } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, type SyncStatusEvent } from '@midnite/studio-shared';
import { app, powerMonitor } from 'electron';

import type { Logger } from './log';
import { currentSettings, onSettingsChange } from './settings-mirror';
import { anyWindowVisible, systemIdleState } from './window-visibility-gate';
import { broadcastToWindowsOnRepo } from './window-manager';

/**
 * Auto-fetch, moved to main (Phase 84 Theme B).
 *
 * `useAutoFetch` (deleted from `app.tsx`) ran one `git fetch` per open repo,
 * once per window, from the renderer — so a detached Graph popout never saw
 * remote movement, and two open windows would have doubled the fetch traffic
 * had the renderer not gated on `document.visibilityState`. One scheduler in
 * main fixes both: it runs once regardless of window count, and Theme D's
 * `broadcastToWindowsOnRepo` (via a `refs` watch event) is what tells every
 * window — main and every popout — that something moved.
 *
 * Reconciled exactly like `watch-service.ts`'s watcher map: one timer per
 * registered repo, started on repo open and stopped on close, never invented
 * ad hoc.
 *
 * **Everything that reaches outside this module is injected** (`Deps`) —
 * the same seam `workflow-engine.ts` uses for its own clock — so
 * `fetch-scheduler.test.ts` can drive the gate, the clock and the fetch result
 * deterministically instead of fighting real timers and a real git process.
 * `index.ts` wires {@link realFetchSchedulerDeps} once at boot.
 */

/** Floor on the configured interval — a stray `0` must not fork-bomb `git`. */
export const MIN_AUTO_FETCH_INTERVAL_MS = 10_000;
export const FETCH_BACKOFF_BASE_MS = 30_000;
export const FETCH_BACKOFF_MAX_MS = 10 * 60_000;

/** Doubles the previous backoff (or starts at the base), capped at the ceiling. */
export function nextFetchBackoffMs(previousMs: number): number {
  if (previousMs <= 0) return FETCH_BACKOFF_BASE_MS;
  return Math.min(previousMs * 2, FETCH_BACKOFF_MAX_MS);
}

/**
 * Did any remote-tracking ref actually move?
 *
 * `git fetch` exits `0` whether it moved zero refs or a hundred, and the
 * watcher's own-write suppression (`fs-activity.ts`) swallows the fs event for
 * main's own write regardless — so this is the only way to know whether the
 * fetch that just ran is news to anyone. Compares by identity (added, removed
 * or re-pointed), not by count.
 */
export function refShasMoved(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): boolean {
  if (before.size !== after.size) return true;
  for (const [name, sha] of after) {
    if (before.get(name) !== sha) return true;
  }
  return false;
}

/** The one gate B.2 asks for — app-wide, not per-repo. */
export function computeFetchGateOpen(input: {
  autoFetchEnabled: boolean;
  anyWindowVisible: boolean;
  idleState: 'active' | 'idle' | 'locked' | 'unknown';
}): boolean {
  if (!input.autoFetchEnabled) return false;
  if (!input.anyWindowVisible) return false;
  return input.idleState !== 'idle' && input.idleState !== 'locked';
}

export type FetchResult = { ok: true } | { ok: false; message: string };

export type FetchSchedulerDeps = {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  /** True while at least one window is visible and un-minimized. */
  anyWindowVisible: () => boolean;
  /** `powerMonitor.getSystemIdleState`, given the same threshold every call. */
  idleState: () => 'active' | 'idle' | 'locked' | 'unknown';
  /** The renderer-mirrored settings — `settings-mirror.ts`. */
  autoFetchEnabled: () => boolean;
  autoFetchIntervalMs: () => number;
  /** `git-engine`'s `fetch`, already routed through the per-repo write queue. */
  runFetch: (repoPath: string) => Promise<FetchResult>;
  /** Every remote-tracking ref's name → sha, for the before/after comparison. */
  remoteRefShas: (repoPath: string) => Promise<Map<string, string>>;
  /** A fetch moved a ref — broadcast `watchEvent {kind:'refs'}` to this repo's windows. */
  broadcastRefsMoved: (repoId: string) => void;
  /** Push a `syncStatus` event for this repo's `fetch` source. */
  broadcastSyncStatus: (event: SyncStatusEvent) => void;
  log: Logger;
};

type RepoState = {
  path: string;
  timer: unknown;
  /** Last time a fetch was actually attempted, for the catch-up check. */
  lastAttemptAt: number;
  backoffMs: number;
  backoffUntil: number | null;
  /** Non-null while the last attempt failed — cleared, and logged, on recovery. */
  lastError: string | null;
};

/** Registered once, real at boot — see `index.ts`. Tests build their own. */
export class FetchScheduler {
  private readonly repos = new Map<string, RepoState>();

  constructor(private readonly deps: FetchSchedulerDeps) {}

  /** Bring the timer set in line with the open repositories — mirrors `reconcileWatchers`. */
  reconcile(repos: readonly { id: string; path: string }[]): void {
    const wanted = new Map(repos.map((repo) => [repo.id, repo.path]));

    for (const repoId of [...this.repos.keys()]) {
      if (!wanted.has(repoId)) this.stop(repoId);
    }
    for (const [repoId, path] of wanted) {
      if (!this.repos.has(repoId)) this.start(repoId, path);
    }
  }

  private start(repoId: string, path: string): void {
    const state: RepoState = {
      path,
      timer: null,
      lastAttemptAt: 0,
      backoffMs: 0,
      backoffUntil: null,
      lastError: null,
    };
    this.repos.set(repoId, state);
    this.arm(repoId, state);
  }

  private stop(repoId: string): void {
    const state = this.repos.get(repoId);
    if (state?.timer !== undefined && state?.timer !== null) this.deps.clearInterval(state.timer);
    this.repos.delete(repoId);
  }

  private arm(repoId: string, state: RepoState): void {
    if (state.timer !== null) this.deps.clearInterval(state.timer);
    const intervalMs = Math.max(MIN_AUTO_FETCH_INTERVAL_MS, this.deps.autoFetchIntervalMs());
    state.timer = this.deps.setInterval(() => void this.attempt(repoId), intervalMs);
  }

  /**
   * The interval changed (Theme B.4's settings push) — re-arm every repo's
   * timer against the new cadence rather than waiting out the old one.
   */
  rearmAll(): void {
    for (const [repoId, state] of this.repos) this.arm(repoId, state);
  }

  /**
   * A window just became visible or focused (B.2's catch-up rule): any repo
   * that has gone a full interval without an attempt gets one right now,
   * rather than waiting for its next scheduled tick.
   */
  catchUp(): void {
    const intervalMs = Math.max(MIN_AUTO_FETCH_INTERVAL_MS, this.deps.autoFetchIntervalMs());
    for (const [repoId, state] of this.repos) {
      if (this.deps.now() - state.lastAttemptAt >= intervalMs) void this.attempt(repoId);
    }
  }

  private async attempt(repoId: string): Promise<void> {
    const state = this.repos.get(repoId);
    if (!state) return;

    if (
      !computeFetchGateOpen({
        autoFetchEnabled: this.deps.autoFetchEnabled(),
        anyWindowVisible: this.deps.anyWindowVisible(),
        idleState: this.deps.idleState(),
      })
    ) {
      return;
    }
    if (state.backoffUntil !== null && this.deps.now() < state.backoffUntil) return;

    state.lastAttemptAt = this.deps.now();
    const before = await this.deps.remoteRefShas(state.path);
    const result = await this.deps.runFetch(state.path);

    if (!result.ok) {
      state.backoffMs = nextFetchBackoffMs(state.backoffMs);
      state.backoffUntil = this.deps.now() + state.backoffMs;
      const firstFailure = state.lastError === null;
      state.lastError = result.message;
      if (firstFailure) this.deps.log.error(`[fetch-scheduler] repo=${repoId} failed: ${result.message}`);
      this.deps.broadcastSyncStatus({
        repoId,
        source: 'fetch',
        backoffUntil: state.backoffUntil,
        error: result.message,
      });
      return;
    }

    const recovered = state.lastError !== null;
    if (recovered) {
      this.deps.log.info(`[fetch-scheduler] repo=${repoId} recovered`);
      this.deps.broadcastSyncStatus({ repoId, source: 'fetch', backoffUntil: null, error: null });
    }
    state.backoffMs = 0;
    state.backoffUntil = null;
    state.lastError = null;

    const after = await this.deps.remoteRefShas(state.path);
    if (refShasMoved(before, after)) this.deps.broadcastRefsMoved(repoId);
  }

  /** Test/diagnostics only. */
  repoCountForTests(): number {
    return this.repos.size;
  }
}

/**
 * The real wiring — Electron windows, `powerMonitor`, git-engine's `fetch`,
 * and `window-manager.ts`'s repo-scoped broadcast. `index.ts` builds exactly
 * one of these at boot and reconciles it alongside `watch-service.ts`.
 */
export function createFetchScheduler(log: Logger): FetchScheduler {
  const deps: FetchSchedulerDeps = {
    now: () => Date.now(),
    setInterval: (fn, ms) => {
      const timer = setInterval(fn, ms);
      (timer as { unref?: () => void }).unref?.();
      return timer;
    },
    clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    anyWindowVisible,
    idleState: systemIdleState,
    autoFetchEnabled: () => currentSettings().autoFetchEnabled,
    autoFetchIntervalMs: () => currentSettings().autoFetchIntervalMs,
    runFetch: async (repoPath) => {
      const result = await gitFetch(repoPath);
      if (result.ok) return { ok: true };
      // `fetch()` only ever answers `ok` or the `error` arm — never
      // `conflict`, which belongs to `pull`/rebase-shaped ops — but the
      // return type is the shared `GitOpResult` envelope, so narrow explicitly.
      const message = result.kind === 'error' ? result.message : 'The fetch failed.';
      return { ok: false, message };
    },
    remoteRefShas: async (repoPath) => {
      const refs = await listRefs(repoPath);
      return new Map(refs.filter((ref) => ref.kind === 'remoteBranch').map((ref) => [ref.fullName, ref.sha]));
    },
    broadcastRefsMoved: (repoId) => {
      broadcastToWindowsOnRepo(repoId, EVENT_CHANNELS.watchEvent, {
        repoId,
        kind: 'refs',
        at: Date.now(),
      });
    },
    broadcastSyncStatus: (event) => {
      broadcastToWindowsOnRepo(event.repoId, EVENT_CHANNELS.syncStatus, event);
    },
    log,
  };

  const scheduler = new FetchScheduler(deps);

  onSettingsChange(() => scheduler.rearmAll());
  app.on('browser-window-focus', () => scheduler.catchUp());
  powerMonitor.on('resume', () => scheduler.catchUp());
  powerMonitor.on('unlock-screen', () => scheduler.catchUp());

  return scheduler;
}

/**
 * The one real instance, built once at boot (`index.ts`) — module-level
 * functions below mirror `watch-service.ts`'s own free-function shape, so
 * `repo-handlers.ts` can reconcile both from the same `syncWatchers` call
 * without threading an instance through.
 */
let singleton: FetchScheduler | null = null;

export function initFetchScheduler(log: Logger): FetchScheduler {
  singleton = createFetchScheduler(log);
  return singleton;
}

/** Bring the scheduler's repo set in line with the registry — mirrors `reconcileWatchers`. */
export function reconcileFetchScheduler(repos: readonly { id: string; path: string }[]): void {
  singleton?.reconcile(repos);
}

