import { create } from 'zustand';

/**
 * Per-window liveness (Phase 84 Theme I, extended by Themes B/C) — whether
 * THIS window can currently see live updates for the repo it is showing.
 *
 * Deliberately not persisted: a watcher's health is a fact about the current
 * process, not something worth restoring stale across a relaunch.
 *
 * `fetchStatus`/`forgeStatus` are fed by `sync.onStatus` (`use-liveness-
 * tracking.ts`), which `fetch-scheduler.ts` and `forge-poller.ts` push to on
 * every failure, recovery or backoff-window change for the repo this window
 * shows. A **paused** tick (no visible window, or the machine idle/locked)
 * pushes nothing at all — B.2's rule is that a pause is silent, not a
 * failure — so these two slots answer "is the source currently backed off
 * after an error", never "is it merely paused right now"; see
 * `outstanding.md` for why the fuller "paused because minimized" amber
 * reason is deliberately not built.
 */
export type LivenessDotState = 'green' | 'amber' | 'red';

/** One background sync source's current health, mirroring `SyncStatusEvent` minus the routing fields. */
export type SyncSourceStatus = { backoffUntil: number | null; error: string | null };

const NO_SYNC_STATUS: SyncSourceStatus = { backoffUntil: null, error: null };

export type LivenessState = {
  /** `Date.now()` of the last watch event seen for the repo this window shows. */
  lastWatchAt: number | null;
  /** Set by a `syncStatus` push naming the watcher itself; `null` means no known failure. */
  watcherError: string | null;
  /** Theme B's fetch scheduler, for the repo this window shows. */
  fetchStatus: SyncSourceStatus;
  /** Theme C's forge poller, for the repo this window shows. */
  forgeStatus: SyncSourceStatus;
  /** A fresh watch event arrived — clears any previously recorded error. */
  recordWatchEvent: (at: number) => void;
  /** The watcher itself reported a failure (or recovered, with `null`). */
  recordWatcherError: (message: string | null) => void;
  /** A `syncStatus` push for `fetch` or `forge` — see `use-liveness-tracking.ts`. */
  recordSyncStatus: (source: 'fetch' | 'forge', status: SyncSourceStatus) => void;
  /** Called on repo switch: the old repo's state says nothing about the new one. */
  reset: () => void;
};

export const useLivenessStore = create<LivenessState>((set) => ({
  lastWatchAt: null,
  watcherError: null,
  fetchStatus: NO_SYNC_STATUS,
  forgeStatus: NO_SYNC_STATUS,
  recordWatchEvent: (at) => set({ lastWatchAt: at, watcherError: null }),
  recordWatcherError: (message) => set({ watcherError: message }),
  recordSyncStatus: (source, status) =>
    set(source === 'fetch' ? { fetchStatus: status } : { forgeStatus: status }),
  reset: () =>
    set({
      lastWatchAt: null,
      watcherError: null,
      fetchStatus: NO_SYNC_STATUS,
      forgeStatus: NO_SYNC_STATUS,
    }),
}));

export type LivenessStatus = { state: LivenessDotState; reason: string };

/** Coarse on purpose, matching `diagnostics-segment.tsx`'s own `relativeTime`. */
function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/** How long a `backoffUntil` is left, for the popover's own detail line. */
function backoffRemaining(backoffUntil: number, now: number): string {
  const seconds = Math.max(0, Math.round((backoffUntil - now) / 1000));
  if (seconds < 60) return `retrying in ${seconds}s`;
  return `retrying in ${Math.round(seconds / 60)}m`;
}

/**
 * Pure so the three states are trivial to assert without mounting anything —
 * `hasRepo`/`now` are passed in rather than read from a store, the same
 * reason `invalidateForWatchKind` takes a `repoId` argument instead of
 * reaching into `ui-store` itself.
 *
 * Precedence: a red watcher error always wins (it means the live-update path
 * itself is broken); then "no repo"; then a backed-off fetch or forge source
 * (Themes B/C — amber, since the repo is still reachable, just not being
 * polled right now); then "no event yet"; green is what is left.
 */
export function computeLivenessStatus(
  {
    lastWatchAt,
    watcherError,
    fetchStatus,
    forgeStatus,
  }: Pick<LivenessState, 'lastWatchAt' | 'watcherError' | 'fetchStatus' | 'forgeStatus'>,
  hasRepo: boolean,
  now: number = Date.now(),
): LivenessStatus {
  if (watcherError !== null) return { state: 'red', reason: watcherError };
  if (!hasRepo) return { state: 'amber', reason: 'No repository open' };
  if (fetchStatus.error !== null) {
    const detail = fetchStatus.backoffUntil !== null ? `, ${backoffRemaining(fetchStatus.backoffUntil, now)}` : '';
    return { state: 'amber', reason: `Auto-fetch paused: ${fetchStatus.error}${detail}` };
  }
  if (forgeStatus.error !== null) {
    const detail = forgeStatus.backoffUntil !== null ? `, ${backoffRemaining(forgeStatus.backoffUntil, now)}` : '';
    return { state: 'amber', reason: `Forge sync paused: ${forgeStatus.error}${detail}` };
  }
  if (lastWatchAt === null) return { state: 'amber', reason: 'Watching for changes…' };
  return { state: 'green', reason: `Synced ${relativeTime(lastWatchAt, now)}` };
}
