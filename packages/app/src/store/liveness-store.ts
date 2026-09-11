import { create } from 'zustand';

/**
 * Per-window liveness (Phase 84 Theme I) — whether THIS window can currently
 * see live updates for the repo it is showing.
 *
 * Deliberately not persisted: a watcher's health is a fact about the current
 * process, not something worth restoring stale across a relaunch.
 *
 * **Scoped to what Theme A actually wired.** The phase doc's fuller shape
 * (`fetch: {nextAt, backoffUntil, error}`, `forge: {subscriptions,
 * backoffUntil, error}`) belongs to Themes B (`fetch-scheduler.ts`) and C
 * (`forge-poller.ts`), neither of which exists yet — this phase only mounts
 * the listener that makes `watchEvent` actually reach every window (Theme A)
 * and makes a window's `repoId` honest (Theme D). So this store tracks the
 * one signal that is real today (a `watch.onEvent` for the repo THIS window
 * is showing) plus a `watcherError` slot Theme B/C's later `syncStatus` push
 * can set — `recordWatcherError` has no caller yet, on purpose, the same way
 * `broadcastToWindowsOnRepo` has no caller yet after Theme D.2.
 */
export type LivenessDotState = 'green' | 'amber' | 'red';

export type LivenessState = {
  /** `Date.now()` of the last watch event seen for the repo this window shows. */
  lastWatchAt: number | null;
  /** Set by a future `syncStatus` push (Theme B/C); `null` means no known failure. */
  watcherError: string | null;
  /** A fresh watch event arrived — clears any previously recorded error. */
  recordWatchEvent: (at: number) => void;
  /** For Theme B/C to call once main can report a watcher failure. */
  recordWatcherError: (message: string | null) => void;
  /** Called on repo switch: the old repo's timestamp says nothing about the new one. */
  reset: () => void;
};

export const useLivenessStore = create<LivenessState>((set) => ({
  lastWatchAt: null,
  watcherError: null,
  recordWatchEvent: (at) => set({ lastWatchAt: at, watcherError: null }),
  recordWatcherError: (message) => set({ watcherError: message }),
  reset: () => set({ lastWatchAt: null, watcherError: null }),
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

/**
 * Pure so the three states are trivial to assert without mounting anything —
 * `hasRepo`/`now` are passed in rather than read from a store, the same
 * reason `invalidateForWatchKind` takes a `repoId` argument instead of
 * reaching into `ui-store` itself.
 */
export function computeLivenessStatus(
  { lastWatchAt, watcherError }: Pick<LivenessState, 'lastWatchAt' | 'watcherError'>,
  hasRepo: boolean,
  now: number = Date.now(),
): LivenessStatus {
  if (watcherError !== null) return { state: 'red', reason: watcherError };
  if (!hasRepo) return { state: 'amber', reason: 'No repository open' };
  if (lastWatchAt === null) return { state: 'amber', reason: 'Watching for changes…' };
  return { state: 'green', reason: `Synced ${relativeTime(lastWatchAt, now)}` };
}
