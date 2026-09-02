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
 * `useState`-based and panel-local, not a zustand store: there is never more than one instance of
 * a consuming panel mounted at once, and a store would invite the cross-view coupling a panel-local
 * primitive is meant to avoid.
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

const DEFAULT_MAX_DEPTH = 20;

export function usePanelHistory<T>(initial: T, options: PanelHistoryOptions<T> = {}): PanelHistory<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const isSame = options.isSame ?? Object.is;

  const [state, setState] = useState<{ entries: T[]; index: number }>({
    entries: [initial],
    index: 0,
  });

  const push = useCallback(
    (entry: T) => {
      setState((prev) => {
        const current = prev.entries[prev.index];
        if (current !== undefined && isSame(current, entry)) return prev;

        const truncated = [...prev.entries.slice(0, prev.index + 1), entry];
        // Drop from the head once over the cap — and decrement index in the
        // same update, the hazard this primitive exists to get right.
        const overflow = truncated.length - maxDepth;
        const entries = overflow > 0 ? truncated.slice(overflow) : truncated;
        return { entries, index: entries.length - 1 };
      });
    },
    [isSame, maxDepth],
  );

  const replace = useCallback((entry: T) => {
    setState((prev) => {
      const entries = [...prev.entries];
      entries[prev.index] = entry;
      return { entries, index: prev.index };
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => (prev.index <= 0 ? prev : { entries: prev.entries, index: prev.index - 1 }));
  }, []);

  const forward = useCallback(() => {
    setState((prev) =>
      prev.index >= prev.entries.length - 1 ? prev : { entries: prev.entries, index: prev.index + 1 },
    );
  }, []);

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
