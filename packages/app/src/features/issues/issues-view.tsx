import { LuRefreshCw } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useForgeIssues, useRefreshForge } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { useIssuesStore } from '../../store/issues-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { IssueDetail } from './issue-detail';
import { IssueList } from './issue-list';
import { IssueListSkeleton } from './issues-skeletons';
import { pickInitialIssue } from './issue-order';

/**
 * The Issues view: an issue list, and one issue read in full.
 *
 * `actions-view.tsx`'s structure, deliberately (Phase 54 Theme C's own
 * recorded decision) — follows the sidebar's repository selection, a
 * resizable split, explicit refresh rather than polling a rate-limited API.
 *
 * Asks for `state: 'all'` at a wider limit than the sidebar section's own
 * `useForgeIssues` call: a dedicated page is the whole picture, the way the
 * Reviews view asks for `'all'` where its sidebar section asks for `'open'`.
 * Theme E's filter toolbar is what narrows it back down.
 */
export function IssuesView() {
  const { repoId } = useActiveWorktree();
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: layout.issuesListWidth,
    onSize: (value) => setLayout('issuesListWidth', value),
    initial: DEFAULT_LAYOUT.issuesListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.issuesListWidth,
  });

  const issues = useForgeIssues(repoId, repoId !== null, 50, 'all');
  const refresh = useRefreshForge(repoId);

  const stored = useIssuesStore((s) => (repoId === null ? null : (s.selectedIssue[repoId] ?? null)));
  const selectIssue = useIssuesStore((s) => s.selectIssue);

  const rows = issues.data?.issues ?? [];

  // The stored selection wins, but only while it still exists — an issue
  // ages out of the fetched page the same way a run or a PR does, and
  // honouring a number no longer in it would leave the pane empty with no
  // way to tell why. Mirrors `ActionsView`'s own fallback exactly.
  const selectedNumber =
    (stored !== null && rows.some((issue) => issue.number === stored) ? stored : null) ??
    pickInitialIssue(rows);
  const selected = rows.find((issue) => issue.number === selectedNumber) ?? null;

  if (repoId === null) {
    return <Notice>Select a repository to see its issues.</Notice>;
  }

  const cli = issues.data?.cli;
  if (cli !== undefined && cli.reason !== 'ready') {
    return <Notice>{cli.hint || 'The GitHub CLI is unavailable.'}</Notice>;
  }
  // A configuration, not a fault — the same reason `IssuesSection` renders a
  // sentence here instead of the red card an `error` would draw.
  if (issues.data?.disabled) {
    return <Notice>Issues are turned off for this repository.</Notice>;
  }
  if (issues.data?.error != null) return <Notice tone="destructive">{issues.data.error}</Notice>;

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Issues
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
            {rows.length}
          </span>
          <IconButton
            icon={LuRefreshCw}
            label="Refresh issues"
            size="sm"
            className="ml-auto"
            onClick={refresh}
          />
        </div>

        {issues.isLoading && rows.length === 0 ? (
          <IssueListSkeleton />
        ) : rows.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {issues.isFetching ? 'Asking GitHub…' : 'No issues.'}
          </p>
        ) : (
          <IssueList
            issues={rows}
            selectedNumber={selectedNumber}
            now={issues.dataUpdatedAt || Date.now()}
            onSelect={(number) => selectIssue(repoId, number)}
          />
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the issue list" />

      {selected === null ? (
        <Notice>{issues.isFetching ? 'Asking GitHub…' : 'No issues to show for this repository.'}</Notice>
      ) : (
        <IssueDetail repoId={repoId} issue={selected} />
      )}
    </div>
  );
}

function Notice({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p
        className={`max-w-md text-center text-sm leading-relaxed ${
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {children}
      </p>
    </div>
  );
}
