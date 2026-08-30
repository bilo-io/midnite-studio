import type { ForgePullScope } from '@midnite/studio-shared';
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

  /**
   * Which of the Reviews view's scope groups are expanded.
   *
   * Not keyed by repo, unlike the selection above: "I care about what is
   * awaiting my review" is a fact about the reader, not about the repository
   * they happen to be looking at, and re-opening the same group after every
   * repo switch would be a chore the sidebar's own sections do not impose.
   *
   * In the store rather than in `ReviewGroupSection`'s own state because the
   * fold gates a `gh` subprocess: local state is torn down whenever the view
   * unmounts, so a trip to Graph and back would collapse every group and make
   * the reader pay for the same three listings again.
   *
   * Absent means closed. Every group starts that way — the whole point of the
   * split is that arriving at the view costs nothing.
   */
  openGroups: Partial<Record<ForgePullScope, boolean>>;
  toggleGroup: (scope: ForgePullScope) => void;
};

export const useReviewsStore = create<ReviewsState>((set) => ({
  selectedPull: {},
  openGroups: {},

  selectPull: (repoId, number) =>
    set((state) => ({ selectedPull: { ...state.selectedPull, [repoId]: number } })),

  toggleGroup: (scope) =>
    set((state) => ({ openGroups: { ...state.openGroups, [scope]: !state.openGroups[scope] } })),
}));
