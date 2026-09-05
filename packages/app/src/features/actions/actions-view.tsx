import { LuRefreshCw } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { VIEW_ICON } from '../../components/nav-icons';
import { PageDetachMark } from '../../components/page-detach-mark';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
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

  const stored = useActionsStore((s) => (repoId === null ? null : (s.selectedRun[repoId] ?? null)));

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
  /*
    The TRANSPORT failing, as distinct from the two envelope failures above
    (Phase 60 Theme C). `gh` reporting "not signed in" and the call to `gh`
    never returning are different problems with different fixes, and until
    this branch existed the second one rendered as "No workflow runs yet." —
    a claim about GitHub made from a call that never reached it.
  */
  if (runs.isError) {
    return (
      <EmptyState
        icon={VIEW_ICON.actions}
        title="Could not reach the GitHub CLI"
        body={runs.error instanceof Error ? runs.error.message : String(runs.error)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
          <PageDetachMark role="actions" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Workflow runs
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
            {rows.length}
          </span>
          <IconButton
            icon={LuRefreshCw}
            label="Refresh workflow runs"
            size="sm"
            className="ml-auto"
            onClick={refresh}
          />
        </div>

        {rows.length === 0 && runs.isFetching ? (
          // A skeleton rather than the sentence this used to show — the pane
          // already knows the shape of a run row, and a spinner or a line of
          // prose throws that away (`components/skeleton.tsx`).
          <RunListSkeleton />
        ) : rows.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No workflow runs yet.</p>
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

/**
 * The run list, at rest — a status glyph, a workflow title and a metadata
 * line per row, which is what `RunList` paints. Six rows fill the pane; the
 * count claims nothing about the page size (`components/skeleton.tsx`).
 */
function RunListSkeleton() {
  return (
    <LoadingRegion label="Asking GitHub for this repository's workflow runs…" className="flex flex-col gap-2 p-2">
      {[58, 71, 46, 64, 52, 68].map((width, index) => (
        <div key={width} className="flex items-start gap-2">
          <Skeleton className="mt-0.5 h-3 w-3 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${width}%` }} />
            <Skeleton className="h-2.5" style={{ width: index % 2 === 0 ? '36%' : '30%' }} />
          </div>
        </div>
      ))}
    </LoadingRegion>
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
