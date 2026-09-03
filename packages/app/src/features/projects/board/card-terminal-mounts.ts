import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * The concurrently-mounted-card-xterm cap (Phase 41 Theme E).
 *
 * Chromium caps live WebGL contexts at roughly 16 per process and evicts the
 * oldest by dropping its context — and `terminal-view.tsx`'s own
 * `onContextLoss` handler degrades that instance to the DOM renderer
 * **permanently**, because nothing ever re-adds the addon. A board of ten
 * running cards plus the main panel's own terminals is a realistic path into
 * that cap, and nothing before this counted contexts at all. Four matches the
 * FAB's own ceiling (Phase 35) — this is not a new number, just a new place
 * it applies.
 *
 * `wanters` is every visible, running card, in the order each asked — not a
 * counter, so that when the card at the front leaves (scrolls away, or its
 * session ends) the next one in line is granted a slot automatically, purely
 * by everyone re-deriving `granted` off the same array. Nothing re-requests
 * anything; there is nothing to re-request.
 */
export const MAX_CARD_TERMINALS = 4;

type State = {
  wanters: readonly string[];
  want: (key: string) => void;
  unwant: (key: string) => void;
};

export const useCardTerminalMounts = create<State>((set) => ({
  wanters: [],
  want: (key) =>
    set((state) => (state.wanters.includes(key) ? state : { wanters: [...state.wanters, key] })),
  unwant: (key) =>
    set((state) =>
      state.wanters.includes(key) ? { wanters: state.wanters.filter((k) => k !== key) } : state,
    ),
}));

/** Pure so the cap rule itself — "first four in line" — has a direct unit test. */
export function isCardTerminalGranted(wanters: readonly string[], key: string): boolean {
  return wanters.slice(0, MAX_CARD_TERMINALS).includes(key);
}

/**
 * `key` is the session id, not the card's `taskRef` — a session ending or
 * being rehomed (Theme H) already means a fresh `key` here on its own, with
 * no separate teardown path to keep in sync.
 */
export function useCardTerminalSlot(key: string, wantsSlot: boolean): boolean {
  const wanters = useCardTerminalMounts((s) => s.wanters);
  const want = useCardTerminalMounts((s) => s.want);
  const unwant = useCardTerminalMounts((s) => s.unwant);

  useEffect(() => {
    if (!wantsSlot) return;
    want(key);
    return () => unwant(key);
  }, [wantsSlot, key, want, unwant]);

  return wantsSlot && isCardTerminalGranted(wanters, key);
}
