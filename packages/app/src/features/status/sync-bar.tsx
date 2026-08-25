import type { BranchStatus } from '@midnite/git-shared';

import { useFetch, usePull, usePush } from '../../services/use-status';

/**
 * Branch state and the three sync actions, modelled on VS Code's status bar.
 *
 * The ahead/behind chips are the point: "do I need to push or pull" is the
 * question people check constantly, and it has to be answerable at a glance
 * without opening a menu.
 *
 * There is no force-push button, and no menu item that could become one. See
 * docs/INITIAL_PLAN.md → Risks.
 */
export function SyncBar({
  branch,
  onError,
}: {
  branch: BranchStatus;
  onError: (message: string) => void;
}) {
  const fetch = useFetch();
  const pull = usePull();
  const push = usePush();

  const busy = fetch.isPending || pull.isPending || push.isPending;
  const hasUpstream = branch.upstream !== null;

  const runOp = async (op: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await op();
    if (!result.ok) onError(result.message ?? 'The operation failed.');
    else onError('');
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
      <span className="truncate font-medium" title={branch.head ?? 'detached HEAD'}>
        {branch.unborn ? `${branch.head ?? 'main'} (no commits)` : (branch.head ?? 'detached')}
      </span>

      {hasUpstream ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="tabular-nums" title={`${branch.ahead} to push`}>
            ↑{branch.ahead}
          </span>
          <span className="tabular-nums" title={`${branch.behind} to pull`}>
            ↓{branch.behind}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">no upstream</span>
      )}

      <span className="ml-auto flex items-center gap-1">
        <SyncButton label="Fetch" busy={busy} onClick={() => void runOp(() => fetch.mutateAsync())} />
        <SyncButton
          label={branch.behind > 0 ? `Pull ${branch.behind}` : 'Pull'}
          busy={busy}
          disabled={!hasUpstream}
          onClick={() => void runOp(() => pull.mutateAsync())}
        />
        <SyncButton
          // Without an upstream the first push has to create one, and saying so
          // is better than letting git fail with "has no upstream branch".
          label={hasUpstream ? (branch.ahead > 0 ? `Push ${branch.ahead}` : 'Push') : 'Publish'}
          busy={busy}
          onClick={() => void runOp(() => push.mutateAsync({ setUpstream: !hasUpstream }))}
        />
      </span>
    </div>
  );
}

function SyncButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      {label}
    </button>
  );
}
