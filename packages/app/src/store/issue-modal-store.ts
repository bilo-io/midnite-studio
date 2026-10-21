import type { ForgeIssue } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * Which issue the app-wide issue modal is showing, if any.
 *
 * Replaced `issues-store.ts` when the Issues view folded into Tasks: an issue
 * is read in a modal over whatever the user was doing — from a Tasks row, a
 * board card's `#number`, the sidebar's Issues section, the palette or an
 * in-app forge link — rather than by navigating to a page of its own. One
 * modal, mounted once (`IssueModalHost` in `app.tsx`), so every entry point
 * opens the same surface.
 *
 * Unpersisted on purpose, for the reason `issues-store.ts` gave: an issue
 * number ages out, and a modal reopening itself on launch would be a surprise.
 */
export type IssueModalTarget = {
  repoId: string;
  number: number;
  /**
   * The row the caller already holds, when it has one — paints the header at
   * once instead of waiting on `issueDetail`. The modal still fetches the
   * detail for the body and prefers its copy once it lands.
   */
  seed?: ForgeIssue;
};

export type IssueModalState = {
  target: IssueModalTarget | null;
  openIssue: (target: IssueModalTarget) => void;
  closeIssue: () => void;
};

export const useIssueModalStore = create<IssueModalState>((set) => ({
  target: null,
  openIssue: (target) => set({ target }),
  closeIssue: () => set({ target: null }),
}));

/** Non-hook shorthand for callers outside React (palette, link routing, companion). */
export function openIssueModal(target: IssueModalTarget): void {
  useIssueModalStore.getState().openIssue(target);
}
