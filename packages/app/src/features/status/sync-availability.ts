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
 *
 * Scoped to the **checked-out** branch, from a `BranchStatus`. The graph's ref
 * badges answer the same question for an arbitrary ref and live in
 * [`graph/ref-sync.ts`](../graph/ref-sync.ts) — see the note there for why the
 * two stay apart rather than collapsing into one rule table.
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

/**
 * What one click of the Sync button actually runs.
 *
 * The cluster used to be three buttons — fetch, pull, push — beside the very
 * counts that said which of them were live. That is three controls to read a
 * state the counts had already reported, and the two arrows were the pair
 * people reached for in the wrong order: push while behind is a rejection, and
 * pull-then-push is the sequence they meant both times. One button that reads
 * the counts and runs that sequence removes the ordering mistake rather than
 * labelling it. Fetch and push stay individually reachable in the repository's
 * context menu, where an unusual intention belongs.
 *
 * A fetch always leads. It is the step that makes the counts the rest of the
 * plan is reasoning about TRUE — running pull/push off numbers from ten minutes
 * ago is how a "nothing to push" branch turns out to be two behind.
 */
export type SyncStep = SyncOp;

export type SyncPlan = {
  /** In order. Each runs only if the one before it succeeded. */
  steps: SyncStep[];
  /** Accessible name, and the first half of the tooltip. */
  label: string;
  /** What the click will do, in words. The second half of the tooltip. */
  detail: string;
};

export function syncPlan(branch: BranchStatus): SyncPlan {
  if (branch.detached) {
    return {
      steps: ['fetch'],
      label: 'Fetch',
      detail: 'HEAD is detached, so fetch is all that can run — check out a branch to pull or push.',
    };
  }

  if (branch.unborn) {
    return {
      steps: ['fetch'],
      label: 'Fetch',
      detail: 'This repository has no commits yet, so there is nothing to pull into or push.',
    };
  }

  // No upstream: the click has to CREATE one, which is a different enough act
  // to deserve its own name. Nothing about "Sync" says "a branch appears on the
  // remote", and this is the only path in the app that publishes one now that
  // the Push button is gone.
  if (branch.upstream === null) {
    return {
      steps: ['fetch', 'push'],
      label: 'Publish branch',
      detail: `Fetch, then push ${branch.head ?? 'this branch'} and set its upstream.`,
    };
  }

  const steps: SyncStep[] = ['fetch'];
  if (branch.behind > 0) steps.push('pull');
  if (branch.ahead > 0) steps.push('push');

  if (steps.length === 1) {
    return {
      steps,
      label: 'Fetch',
      detail: 'Nothing to pull or push as of the last fetch. This fetches again.',
    };
  }

  return { steps, label: 'Sync', detail: `Fetch, then ${describePlan(branch)}.` };
}

const describePlan = ({ ahead, behind }: BranchStatus): string =>
  behind > 0 && ahead > 0
    ? `pull ${behind} and push ${ahead}`
    : behind > 0
      ? `pull ${behind}`
      : `push ${ahead}`;
