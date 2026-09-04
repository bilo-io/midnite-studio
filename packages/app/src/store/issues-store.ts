import { create } from 'zustand';

/**
 * Which issue the Issues view is showing, per repository.
 *
 * Mirrors `reviews-store.ts` exactly, down to the reason it stays
 * unpersisted: an issue number ages out of the fetched list the same way a PR
 * number does, and a restored selection would open on "that issue is no
 * longer in the list" more often than not.
 */

/** Keyed by repo, so switching repositories in the sidebar keeps the answer. */
type ByRepo<T> = Record<string, T>;

export type IssuesState = {
  /** Explicit selection. Absent means "whatever the view auto-selects". */
  selectedIssue: ByRepo<number>;
  selectIssue: (repoId: string, number: number) => void;
};

export const useIssuesStore = create<IssuesState>((set) => ({
  selectedIssue: {},

  selectIssue: (repoId, number) =>
    set((state) => ({ selectedIssue: { ...state.selectedIssue, [repoId]: number } })),
}));
