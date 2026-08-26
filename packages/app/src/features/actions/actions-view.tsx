import { RefreshCw } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useForgeRunDetail, useForgeRuns, useRefreshForge } from '../../services/queries';
import { useActionsStore } from '../../store/actions-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useActiveWorktree } from '../../services/use-status';
import { RunDetail } from './run-detail';
import { RunList } from './run-list';
import { pickInitialRun } from './run-groups';

/**
 * The Actions view: a run list, and one run read in depth.
 *
 * Follows the sidebar's repository selection, exactly as the Phase 18
 * diagnostics segment and the Phase 19 dashboard do — one repository at a time,
 * because "which repo is this about" is the app's primary context and a view
 * that answered it differently from the sidebar would be a second answer.
 *
 * Refresh is explicit. Polling a run to completion is a subprocess every few
 * seconds against a rate-limited API, and a CI run that takes eight minutes
 * would cost a hundred of them for information the user can ask for once.
 */
export function ActionsView() {
  const { repoId } = useActiveWorktree();
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: layout.actionsListWidth,
    onSize: (value) => setLayout('actionsListWidth', value),
    initial: DEFAULT_LAYOUT.actionsListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.actionsListWidth,
  });

  const runs = useForgeRuns(repoId, repoId !== null);
  const refresh = useRefreshForge(repoId);

  const stored = useActionsStore((s) => (repoId === null ? null : s.selectedRun[repoId] ?? null));

  /*
    One `now` for the whole paint, and the right one.

    Every run row renders a relative age. `dataUpdatedAt` is when this listing
    was actually fetched, which is a better answer than `Date.now()` on two
    counts: every row in a paint agrees, and the ages stay honest about being
    as old as the data rather than creeping forward while a stale payload sits
    on screen. It is also plain reactive state, so nothing here has to lie to
    the dependency linter about reading a clock.
  */
  const now = runs.dataUpdatedAt || Date.now();

  const rows = runs.data?.runs ?? [];

  /*
    The stored selection wins, but only while it still exists.

    Runs age out of `gh run list`, so a selection made twenty minutes ago can
    name a run that is no longer in the payload — and honouring it would leave
    the detail pane empty with no way to tell why. Falling back to the auto-pick
    means the view is always showing something real.
  */
  const selectedRunId =
    (stored !== null && rows.some((run) => run.id === stored) ? stored : null) ??
    pickInitialRun(rows);
  const selected = rows.find((run) => run.id === selectedRunId) ?? null;

  const detail = useForgeRunDetail(repoId, selectedRunId, selectedRunId !== null);

  if (repoId === null) {
    return <Notice>Select a repository to see its workflow runs.</Notice>;
  }

  const cli = runs.data?.cli;
  if (cli !== undefined && cli.reason !== 'ready') {
    return <Notice>{cli.hint || 'The GitHub CLI is unavailable.'}</Notice>;
  }
  if (runs.data?.error != null) return <Notice tone="destructive">{runs.data.error}</Notice>;

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Workflow runs
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
            {rows.length}
          </span>
          <IconButton
            icon={RefreshCw}
            label="Refresh workflow runs"
            size="sm"
            className="ml-auto"
            onClick={refresh}
          />
        </div>

        {rows.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {runs.isFetching ? 'Asking GitHub…' : 'No workflow runs yet.'}
          </p>
        ) : (
          <RunList repoId={repoId} runs={rows} selectedRunId={selectedRunId} now={now} />
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the run list" />

      {selected === null ? (
        <Notice>
          {runs.isFetching ? 'Asking GitHub…' : 'No workflow runs to show for this repository.'}
        </Notice>
      ) : (
        <RunDetail
          repoId={repoId}
          run={selected}
          jobs={detail.data?.detail?.jobs ?? []}
          loadingJobs={detail.isFetching}
          jobsError={detail.data?.error ?? null}
        />
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
