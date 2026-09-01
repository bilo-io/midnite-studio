import type { BranchStatus, GitOpResult } from '@midnite/studio-shared';
import { LuRefreshCw } from 'react-icons/lu';
import { IoCloudUploadOutline } from 'react-icons/io5';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useTargetedGitOp, type StatusTarget } from '../../services/use-status';
import { startClaude } from '../terminal/start-claude';
import { syncPlan, type SyncPlan, type SyncStep } from './sync-availability';
import { syncResolution, type SyncFailure } from './sync-resolution';

/**
 * Sync, for one checkout.
 *
 * One button where there were three. Fetch, pull and push sat in a row beside
 * the very counts that said which of them could do anything — and the two
 * arrows were routinely pressed in the wrong order, because "push while behind"
 * is a rejection and the sequence people meant both times was pull-then-push.
 * This runs `syncPlan`'s sequence, so the counts ARE the button.
 *
 * The individual verbs did not disappear: the repository's context menu still
 * carries Fetch, Pull and Push for the times an unusual one is meant.
 *
 * The target is a prop rather than the selected checkout precisely so a sidebar
 * row can sync a repository the user has not selected.
 *
 * There is no force-push button, and no menu that could become one. See
 * docs/INITIAL_PLAN.md → Risks.
 *
 * The glyph is a reload, not the Git logo it briefly became. The logo names the
 * tool; this button names an action, and the git menu beside it now carries the
 * branded mark — wearing it here too left the row saying "git" twice and
 * nothing about what a click does.
 */
export function SyncControls({
  target,
  branch,
  size = 'md',
  onError,
}: {
  target: StatusTarget;
  branch: BranchStatus;
  size?: 'sm' | 'md';
  /** Called with '' on success, so a stale message clears itself. */
  onError?: (message: string) => void;
}) {
  const dialogs = useDialogs();

  const fetch = useTargetedGitOp<void>(target, 'fetch', (api, _args, ctx) =>
    api.ops.fetch({ ...ctx }),
  );
  const pull = useTargetedGitOp<void>(target, 'pull', (api, _args, ctx) =>
    api.ops.pull({ ...ctx }),
  );
  const push = useTargetedGitOp<{ setUpstream: boolean }>(target, 'push', (api, args, ctx) =>
    api.ops.push({ ...ctx, setUpstream: args.setUpstream }),
  );

  const busy = fetch.isPending || pull.isPending || push.isPending;
  const plan = syncPlan(branch);

  const runStep = (step: SyncStep): Promise<GitOpResult> => {
    if (step === 'fetch') return fetch.mutateAsync();
    if (step === 'pull') return pull.mutateAsync();
    return push.mutateAsync({ setUpstream: branch.upstream === null });
  };

  /**
   * A failed step ends the sync where it stands.
   *
   * Pushing after a pull that conflicted would push a half-merged tree, and
   * there is nothing to fetch again after a fetch that could not authenticate.
   * The dialog says which step stopped, so "no later step ran" is legible
   * rather than inferred from counts that did not move.
   */
  const runSync = async () => {
    onError?.('');
    for (const step of plan.steps) {
      const result = await runStep(step);
      if (!result.ok) {
        offerResolution(step, result);
        return;
      }
    }
  };

  const offerResolution = (step: SyncStep, result: Extract<GitOpResult, { ok: false }>) => {
    const failure: SyncFailure =
      result.kind === 'conflict'
        ? { step, kind: 'conflict', op: result.op, files: result.files }
        : {
            step,
            kind: 'error',
            message: result.message,
            ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
          };

    const resolution = syncResolution(failure, branch);

    /*
      No checkout path means no directory to open a terminal in — the sidebar
      targets a repository whose main worktree it could not find. The failure is
      still worth reporting; only the offer to repair it is withdrawn, because a
      button that names a repair it cannot start is worse than no button.
    */
    const cwd = target.worktreePath;
    const repoId = target.repoId;
    const canRepair = cwd !== undefined && repoId !== null;

    dialogs.confirm({
      title: resolution.title,
      body: canRepair
        ? `${resolution.body} Claude opens in a terminal here with the prompt typed — your Return sends it.`
        : resolution.body,
      warnings: resolution.warnings,
      // Explicitly null, not absent: the dialog reads `undefined` as "still
      // counting" and shows a spinner line for a count nobody is taking.
      blastRadius: null,
      confirmLabel: canRepair ? resolution.confirmLabel : 'Close',
      onConfirm: () => {
        if (!canRepair) return;
        startClaude({ repoId, cwd, title: resolution.title, prompt: resolution.prompt });
      },
    });
  };

  return (
    <IconButton
      icon={plan.label === 'Publish branch' ? IoCloudUploadOutline : LuRefreshCw}
      size={size}
      busy={busy}
      // Both halves of the tooltip and the accessible name: the label alone
      // ("Sync") does not say that a click is about to push two commits.
      label={`${plan.label} — ${plan.detail}`}
      onClick={() => void runSync()}
    >
      <AheadBehind branch={branch} plan={plan} />
    </IconButton>
  );
}

/**
 * `↑2 ↓3`, inside the button that acts on them.
 *
 * Rendered even at `↑0 ↓0`: the pair is a reading of the branch's relationship
 * to its upstream, and hiding it when both are zero means "in sync" and "no
 * upstream" look identical. An unpublished branch says "publish" instead — the
 * word is both the missing state and the offer, and an icon alone in both cases
 * would be exactly the collapse this is written to avoid.
 *
 * The plan decides that, not the missing upstream: a detached HEAD also has no
 * upstream and cannot publish anything, so it gets neither counts nor a word it
 * would not honour.
 *
 * No `title` on the counts any more. They sit inside a control that already
 * carries a tooltip, and a nested native tooltip beat it to the pointer.
 */
function AheadBehind({ branch, plan }: { branch: BranchStatus; plan: SyncPlan }) {
  if (branch.upstream === null) {
    return plan.steps.includes('push') ? (
      <span className="text-[11px] text-muted-foreground">publish</span>
    ) : null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
      <span className={branch.ahead === 0 ? 'opacity-50' : ''}>↑{branch.ahead}</span>
      <span className={branch.behind === 0 ? 'opacity-50' : ''}>↓{branch.behind}</span>
    </span>
  );
}
