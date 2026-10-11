import { create } from 'zustand';

/**
 * Phase 112 Theme D — which card the Tasks view has open, lifted out of
 * `TasksView`'s local `useState` so a reveal can select a card before the
 * view has mounted (the engine switches view a render before it selects).
 *
 * Keyed by repo: the selection is only honoured for the repo it was made in,
 * so switching repository starts without a card open, as the unmount-reset
 * local state used to. Not persisted — a card id ages out with its board.
 *
 * `revealNonce` is the "scroll to it" half: a click selects a card that is
 * already on screen and needs no scroll, a reveal may select one far off, so
 * only `revealCard` bumps it and `BoardView` scrolls on the bump.
 */
export type BoardSelectionState = {
  selected: { repoId: string; itemId: string } | null;
  revealNonce: number;
  select: (repoId: string | null, itemId: string | null) => void;
  revealCard: (repoId: string, itemId: string) => void;
};

export const useBoardSelectionStore = create<BoardSelectionState>()((set) => ({
  selected: null,
  revealNonce: 0,
  select: (repoId, itemId) =>
    set({ selected: repoId !== null && itemId !== null ? { repoId, itemId } : null }),
  revealCard: (repoId, itemId) =>
    set((state) => ({ selected: { repoId, itemId }, revealNonce: state.revealNonce + 1 })),
}));

/** The selected card id for `repoId`, or `null` when nothing (or another repo's card) is selected. */
export const selectedCardFor =
  (repoId: string | null) =>
  (state: BoardSelectionState): string | null =>
    repoId !== null && state.selected?.repoId === repoId ? state.selected.itemId : null;
