import { ArrowDownToLine, ArrowUpFromLine, GitBranch, RefreshCw } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { useFetch, usePull, usePush, useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';

/**
 * Branch state and the three sync actions.
 *
 * Lives in the title bar rather than inside the Changes view, where it used to
 * be: "do I need to push or pull" is checked constantly and from whichever view
 * you happen to be in — hiding it behind a tab makes it unanswerable from the
 * graph, which is where most of the time is spent.
 *
 * There is no force-push button, and no menu that could become one. See
 * docs/INITIAL_PLAN.md → Risks.
 */
export function SyncActions({ onError }: { onError?: (message: string) => void }) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const { data: status } = useStatus();
  const fetch = useFetch();
  const pull = usePull();
  const push = usePush();

  // Nothing to sync and nothing to name: render nothing rather than a row of
  // dead buttons over an empty workspace.
  if (!repoId || !status) return null;

  const branch = status.branch;
  const busy = fetch.isPending || pull.isPending || push.isPending;
  const hasUpstream = branch.upstream !== null;

  const run = async (op: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await op();
    onError?.(result.ok ? '' : (result.message ?? 'The operation failed.'));
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        className="flex min-w-0 items-center gap-1 text-muted-foreground"
        title={branch.head ?? 'detached HEAD'}
      >
        <GitBranch aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[12rem] truncate">
          {branch.unborn ? `${branch.head ?? 'main'} (no commits)` : (branch.head ?? 'detached')}
        </span>
      </span>

      {hasUpstream ? (
        <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
          <span title={`${branch.ahead} to push`}>↑{branch.ahead}</span>
          <span title={`${branch.behind} to pull`}>↓{branch.behind}</span>
        </span>
      ) : null}

      <span className="ml-1 flex items-center gap-0.5">
        <IconButton
          icon={RefreshCw}
          label="Fetch"
          busy={fetch.isPending}
          disabled={busy}
          onClick={() => void run(() => fetch.mutateAsync())}
        />
        <IconButton
          icon={ArrowDownToLine}
          label={branch.behind > 0 ? `Pull ${branch.behind}` : 'Pull'}
          busy={pull.isPending}
          disabled={busy || !hasUpstream}
          onClick={() => void run(() => pull.mutateAsync())}
        />
        <IconButton
          icon={ArrowUpFromLine}
          // Without an upstream the first push has to create one, and saying so
          // is better than letting git fail with "has no upstream branch".
          label={hasUpstream ? (branch.ahead > 0 ? `Push ${branch.ahead}` : 'Push') : 'Publish branch'}
          busy={push.isPending}
          disabled={busy}
          onClick={() => void run(() => push.mutateAsync({ setUpstream: !hasUpstream }))}
        />
      </span>
    </div>
  );
}
