import type { BranchStatus } from '@midnite/git-shared';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { useTargetedGitOp, type StatusTarget } from '../../services/use-status';
import { syncAffordances } from './sync-availability';

/**
 * Fetch / pull / push for one checkout.
 *
 * Extracted from the title bar so the sidebar's repository headers can carry
 * the same three buttons: "do I need to push?" is a per-repository question,
 * and answering it only for the selected repo means opening each one in turn to
 * find out. The target is a prop rather than the selected checkout precisely so
 * a row can act on a repository the user has not selected.
 *
 * There is no force-push button, and no menu that could become one. See
 * docs/INITIAL_PLAN.md → Risks.
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
  const fetch = useTargetedGitOp<void>(target, (api, _args, ctx) => api.ops.fetch({ ...ctx }));
  const pull = useTargetedGitOp<void>(target, (api, _args, ctx) => api.ops.pull({ ...ctx }));
  const push = useTargetedGitOp<{ setUpstream: boolean }>(target, (api, args, ctx) =>
    api.ops.push({ ...ctx, setUpstream: args.setUpstream }),
  );

  const busy = fetch.isPending || pull.isPending || push.isPending;
  const sync = syncAffordances(branch);

  const run = async (op: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await op();
    onError?.(result.ok ? '' : (result.message ?? 'The operation failed.'));
  };

  /**
   * While an operation is in flight every button in the cluster is inert, but
   * only as `busy`/`disabled` — never as an *explained* disable. A reason is a
   * statement about the repository ("nothing to push"), and overwriting it with
   * "a fetch is running" for a second would make the tooltip lie about why.
   */
  const affordance = (op: 'fetch' | 'pull' | 'push') => {
    const { label, enabled, reason } = sync[op];
    return {
      label,
      disabled: !enabled || busy,
      ...(enabled ? {} : { disabledReason: reason }),
    };
  };

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <IconButton
        icon={RefreshCw}
        size={size}
        busy={fetch.isPending}
        {...affordance('fetch')}
        onClick={() => void run(() => fetch.mutateAsync())}
      />
      <IconButton
        icon={ArrowDownToLine}
        size={size}
        busy={pull.isPending}
        {...affordance('pull')}
        onClick={() => void run(() => pull.mutateAsync())}
      />
      <IconButton
        icon={ArrowUpFromLine}
        size={size}
        busy={push.isPending}
        {...affordance('push')}
        onClick={() => void run(() => push.mutateAsync({ setUpstream: branch.upstream === null }))}
      />
    </span>
  );
}

/**
 * `↑2 ↓3`, or nothing at all without an upstream.
 *
 * Rendered even at `↑0 ↓0`: the pair is a reading of the branch's relationship
 * to its upstream, and hiding it when both are zero means "in sync" and "no
 * upstream" look identical.
 */
export function AheadBehind({ branch }: { branch: BranchStatus }) {
  if (branch.upstream === null) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
      <span title={`${branch.ahead} to push`} className={branch.ahead === 0 ? 'opacity-50' : ''}>
        ↑{branch.ahead}
      </span>
      <span title={`${branch.behind} to pull`} className={branch.behind === 0 ? 'opacity-50' : ''}>
        ↓{branch.behind}
      </span>
    </span>
  );
}
