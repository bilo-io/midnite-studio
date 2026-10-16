import { useCallback, useMemo, useState } from 'react';

/**
 * A generic, panel-local back/forward history stack (Phase 42 Theme A).
 *
 * Councils is consumer #1; Projects ([Phase 40](../../../../.midnite/tasks/phases/phase-40-github-projects.md))
 * and Workflows ([Phase 43](../../../../.midnite/tasks/phases/phase-43-workflows-mvp.md)) are its
 * obvious next ones, which is why this lives in `components/` rather than `features/councils/`.
 *
 * Modelled on `ui-store.ts`'s `viewHistory`/`viewHistoryIndex` — push truncates the forward tail,
 * `back`/`forward` guard at the ends — but deliberately **not** a copy of it in two ways:
 *
 * - **No `guardNavigation` wrapper.** `viewHistory`'s three actions all run inside
 *   `useFileEditorStore.getState().guardNavigation(...)` because a view switch can abandon a dirty
 *   file editor. A panel-local stack has no editor to guard, and pulling that dependency into a
 *   shared `components/` primitive would couple it to the file editor for every future consumer.
 * - **Bounded depth.** `viewHistory` grows without limit. This stack caps at `maxDepth` (default
 *   20) so a pathological loop of pushes cannot grow the array forever — dropping from the head
 *   decrements `index` in the same update, or `back`/`forward` would point at the wrong entry the
 *   moment the cap is hit.
 *
 * `useState`-based and panel-local by default, not a zustand store: there is usually never more
 * than one instance of a consuming panel mounted at once, and a store would invite the cross-view
 * coupling a panel-local primitive is meant to avoid. **The one exception is a lazy-mounted panel
 * that needs its stack to survive being unmounted** (Councils — Phase 42 Theme E): the pure state
 * transitions below (`pushHistoryState` etc.) are exported precisely so a consumer in that
 * position can drive them from its own module-level store instead, without re-deriving the
 * depth-cap arithmetic by hand.
 */

export type PanelHistoryOptions<T> = {
  /** Entries beyond this are dropped from the head. Default 20. */
  maxDepth?: number;
  /**
   * Equality for the "pushing the current entry again is a no-op" rule.
   * Defaults to `Object.is`, which is almost never right for an object entry
   * — pass one that compares your entry's identity fields.
   */
  isSame?: (a: T, b: T) => boolean;
};

export type PanelHistory<T> = {
  /** The full stack, oldest first. Rarely needed directly — `current` is usually enough. */
  entries: T[];
  index: number;
  current: T;
  /** Push a new entry, truncating any forward tail. A no-op if it equals the current entry. */
  push: (entry: T) => void;
  /** Replace the current entry in place, without adding a history step. */
  replace: (entry: T) => void;
  back: () => void;
  forward: () => void;
  /** Reset the whole stack to one entry (default: the original `initial`). */
  reset: (entry?: T) => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

export const DEFAULT_MAX_DEPTH = 20;

/** The bare `{ entries, index }` shape the pure transitions below operate on. */
export type PanelHistoryState<T> = { entries: T[]; index: number };

/**
 * Push, truncating any forward tail and enforcing the depth cap — a no-op if
 * `entry` equals the current top per `isSame`. Exported so a module-level
 * store (Councils' own — Theme E) can reuse the exact same arithmetic
 * `usePanelHistory` itself runs on, including the depth-cap/index hazard.
 */
export function pushHistoryState<T>(
  state: PanelHistoryState<T>,
  entry: T,
  isSame: (a: T, b: T) => boolean,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): PanelHistoryState<T> {
  const current = state.entries[state.index];
  if (current !== undefined && isSame(current, entry)) return state;

  const truncated = [...state.entries.slice(0, state.index + 1), entry];
  // Drop from the head once over the cap — and decrement index in the same
  // update, the hazard this primitive exists to get right.
  const overflow = truncated.length - maxDepth;
  const entries = overflow > 0 ? truncated.slice(overflow) : truncated;
  return { entries, index: entries.length - 1 };
}

export function replaceHistoryState<T>(state: PanelHistoryState<T>, entry: T): PanelHistoryState<T> {
  const entries = [...state.entries];
  entries[state.index] = entry;
  return { entries, index: state.index };
}

export function backHistoryState<T>(state: PanelHistoryState<T>): PanelHistoryState<T> {
  return state.index <= 0 ? state : { entries: state.entries, index: state.index - 1 };
}

export function forwardHistoryState<T>(state: PanelHistoryState<T>): PanelHistoryState<T> {
  return state.index >= state.entries.length - 1
    ? state
    : { entries: state.entries, index: state.index + 1 };
}

export function usePanelHistory<T>(initial: T, options: PanelHistoryOptions<T> = {}): PanelHistory<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const isSame = options.isSame ?? Object.is;

  const [state, setState] = useState<PanelHistoryState<T>>({
    entries: [initial],
    index: 0,
  });

  const push = useCallback(
    (entry: T) => setState((prev) => pushHistoryState(prev, entry, isSame, maxDepth)),
    [isSame, maxDepth],
  );

  const replace = useCallback((entry: T) => setState((prev) => replaceHistoryState(prev, entry)), []);

  const back = useCallback(() => setState(backHistoryState), []);

  const forward = useCallback(() => setState(forwardHistoryState), []);

  const reset = useCallback(
    (entry?: T) => {
      setState({ entries: [entry ?? initial], index: 0 });
    },
    [initial],
  );

  return useMemo(
    () => ({
      entries: state.entries,
      index: state.index,
      current: state.entries[state.index] as T,
      push,
      replace,
      back,
      forward,
      reset,
      canGoBack: state.index > 0,
      canGoForward: state.index < state.entries.length - 1,
    }),
    [state, push, replace, back, forward, reset],
  );
}
