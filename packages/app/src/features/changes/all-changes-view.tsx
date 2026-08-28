import { useAllChangesTotals, useRepoStatus, useStatusCounts } from '../../services/use-status';
import { ChangesAccordion } from './changes-accordion';

/**
 * Every changed file in one checkout, each in its own accordion — VS Code's
 * multi-diff editor.
 *
 * The Changes panel answers "what do I stage next", one file at a time. This
 * answers a different question — "what did I actually do here" — and it does
 * it for a checkout addressed BY NAME, so it can show a worktree the sidebar
 * has not selected. That is why every path through here carries an explicit
 * `worktreePath` rather than reading the store — unlike the Changes panel's
 * own "view all" toggle, which reuses `ChangesAccordion` with data it already
 * has for the checkout it is looking at.
 *
 * No new IPC underneath: `status.get` and `status.fileDiff` have both taken an
 * optional `worktreePath` since Phase 6, and main validates it against
 * `git worktree list` before it becomes a cwd.
 */
export function AllChangesView({
  repoId,
  worktreePath,
  label,
}: {
  repoId: string;
  worktreePath: string;
  /** The branch or path this checkout is known by, for the empty state. */
  label: string;
}) {
  const { data: status, isPlaceholderData } = useRepoStatus({ repoId, worktreePath });
  const counts = useStatusCounts({ repoId, worktreePath });
  const totals = useAllChangesTotals({ repoId, worktreePath }) ?? {
    fileCount: 0,
    insertions: 0,
    deletions: 0,
  };

  const loaded = isPlaceholderData ? undefined : status;

  if (!loaded) {
    return <Empty>Reading {label}…</Empty>;
  }

  return (
    <ChangesAccordion
      repoId={repoId}
      worktreePath={worktreePath}
      entries={loaded.entries}
      counts={counts}
      totals={totals}
      leading={<span className="min-w-0 truncate text-xs font-medium">{label}</span>}
      emptyMessage={`No uncommitted changes in ${label}.`}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
