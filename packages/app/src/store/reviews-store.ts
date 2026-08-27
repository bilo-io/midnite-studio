import { create } from 'zustand';

/**
 * Which pull request the Reviews view is showing, per repository.
 *
 * A store rather than component state, for the same reason `actions-store.ts`
 * is one: the *sidebar* can choose it too — clicking a PR row there switches
 * to the Reviews view with that PR selected, and the two live in different
 * trees. Deliberately NOT persisted: a PR number ages out of the fetched
 * list like a run id does, and a restored selection would be a pane opening
 * on "that PR is no longer in the recent list" more often than not.
 */

/** Keyed by repo, so switching repositories in the sidebar keeps both answers. */
type ByRepo<T> = Record<string, T>;

export type ReviewsState = {
  /** Explicit selection. Absent means "whatever the view auto-selects". */
  selectedPull: ByRepo<number>;
  selectPull: (repoId: string, number: number) => void;
};

export const useReviewsStore = create<ReviewsState>((set) => ({
  selectedPull: {},

  selectPull: (repoId, number) =>
    set((state) => ({ selectedPull: { ...state.selectedPull, [repoId]: number } })),
}));
