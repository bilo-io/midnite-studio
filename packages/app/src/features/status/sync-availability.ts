import type { BranchStatus } from '@midnite/git-shared';

/**
 * Which of fetch/pull/push can actually do something, and what to call them.
 *
 * Pure and shared on purpose. The sync cluster now appears twice — once in the
 * title bar for the selected checkout, once per repository row in the sidebar —
 * and "is Push live right now?" is exactly the kind of rule that drifts when
 * each site decides for itself. A disabled button also has to say WHY: the
 * counts it is reasoning about (`↑0 ↓0`) are only as fresh as the last fetch,
 * so "Nothing to push" is information, while a silently grey button is not.
 */
export type SyncOp = 'fetch' | 'pull' | 'push';

export type SyncAffordance = {
  /** Button label and tooltip — carries the count when there is one. */
  label: string;
  enabled: boolean;
  /** Present only when disabled. Appended to the tooltip. */
  reason?: string;
};

export type SyncAffordances = Record<SyncOp, SyncAffordance>;

const off = (label: string, reason: string): SyncAffordance => ({ label, enabled: false, reason });
const on = (label: string): SyncAffordance => ({ label, enabled: true });

export function syncAffordances(branch: BranchStatus): SyncAffordances {
  const hasUpstream = branch.upstream !== null;

  return {
    /**
     * Always live. Fetch is the one operation that can be worth running when
     * the counts say there is nothing to do — it is what makes them true.
     */
    fetch: on('Fetch'),

    pull: branch.detached
      ? off('Pull', 'HEAD is detached — check out a branch to pull into.')
      : branch.unborn
        ? off('Pull', 'This repository has no commits yet.')
        : !hasUpstream
          ? off('Pull', 'This branch has no upstream to pull from.')
          : branch.behind === 0
            ? off('Pull', 'Nothing to pull as of the last fetch.')
            : on(`Pull ${branch.behind}`),

    push: branch.detached
      ? off('Push', 'HEAD is detached — check out a branch to push.')
      : branch.unborn
        ? off('Push', 'This repository has no commits yet.')
        : // Without an upstream the first push has to create one, and saying so
          // beats letting git fail with "has no upstream branch".
          !hasUpstream
          ? on('Publish branch')
          : branch.ahead === 0
            ? off('Push', 'Nothing to push.')
            : on(`Push ${branch.ahead}`),
  };
}
