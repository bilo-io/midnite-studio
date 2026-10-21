import { resourceRefsEqual, type ResourceRef } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * Phase 112 Theme B — the `lastRevealed` slot: the last {@link REVEAL_HISTORY_LIMIT}
 * successful reveals, newest first, with when they happened. Not persisted —
 * "the next one" and "its PR" (Theme H) and `ui.state.lastRevealed` (Theme I)
 * are about this session, not last week's.
 */
export const REVEAL_HISTORY_LIMIT = 20;

export type RevealHistoryEntry = { ref: ResourceRef; at: number };

type RevealHistoryState = {
  entries: readonly RevealHistoryEntry[];
  record: (ref: ResourceRef, at?: number) => void;
  clear: () => void;
};

export const useRevealHistory = create<RevealHistoryState>((set) => ({
  entries: [],
  // Revealing the same thing twice moves it to the front rather than listing it twice.
  record: (ref, at = Date.now()) =>
    set((state) => ({
      entries: [{ ref, at }, ...state.entries.filter((entry) => !resourceRefsEqual(entry.ref, ref))].slice(
        0,
        REVEAL_HISTORY_LIMIT,
      ),
    })),
  clear: () => set({ entries: [] }),
}));

/** The most recent successful reveal, or `null`. */
export function lastRevealed(): ResourceRef | null {
  return useRevealHistory.getState().entries[0]?.ref ?? null;
}
