import { EmptyState } from '../../components/empty-state';
import { VIEW_ICON } from '../../components/nav-icons';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { AllChangesView } from '../changes/all-changes-view';
import { CommitDetail } from '../commit/commit-detail';
import { ReviewView, RunView } from '../forge/forge-detail';
import { StatusPanel } from '../status/status-panel';
import { TabStrip } from './tab-strip';

function CommitDetailView({
  repoId,
  sha,
  worktreePath: _worktreePath,
}: {
  repoId: string;
  sha: string;
  worktreePath?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background p-4">
      <CommitDetail repoId={repoId} sha={sha} />
    </div>
  );
}


/**
 * The Changes view, as a tabbed workbench.
 *
 * The sidebar stays the app's global object list and the content area becomes
 * the place things open INTO — the split `app.tsx` already draws between the
 * nav rail and the repositories panel, extended one level down. Without it,
 * every new surface this phase adds (a whole-checkout diff, a workflow run, a
 * pull request) would have to fight the working-tree panel for the same pane.
 *
 * The working-tree tab is not in the store and cannot be closed: it follows
 * whatever the sidebar has selected, it is where the commit box lives, and a
 * strip that can be emptied to nothing is a view with no content.
 *
 * A closed repository's tabs are pruned by `usePruneClosedRepos`, mounted
 * once from `Shell` rather than here — this component only renders while the
 * Changes view is active, and a repo closed while looking at the Graph should
 * not have to wait for that.
 *
 * The house ladder — error → empty → skeleton → content
 * (`components/skeleton.tsx`) — applies to the working-tree tab, which is the
 * only body this component owns rather than delegates to a tab's own surface.
 * Two of its rungs are here and one is not: `git status` failing is answered
 * by `WorkingTree` below, the first pass is a skeleton shaped like the change
 * list, and the EMPTY rung stays inside `StatusPanel`, which already says "No
 * changes." beside the commit box a clean tree still needs. Restating it here
 * would take that box away from exactly the moment it is most used.
 */
export function Workbench() {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTabId = useWorkbenchStore((s) => s.activeTabId);
  const focusTab = useWorkbenchStore((s) => s.focusTab);
  const closeTab = useWorkbenchStore((s) => s.closeTab);

  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);

  const active = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip
        tabs={tabs}
        activeTabId={active ? active.id : null}
        workingTreeLabel={workingTreeLabel(selectedWorktreePath)}
        onFocus={focusTab}
        onClose={closeTab}
      />

      <div className="min-h-0 flex-1">
        {/*
          Keyed on the tab so switching cross-fades and each body mounts fresh
          — the same entrance treatment the view switcher uses, for the same
          reason: without the key React reuses the element and the animation,
          having already run, never replays.
        */}
        <div key={active?.id ?? 'working-tree'} className="h-full min-h-0 animate-fade-in">
          {active === null ? (
            <WorkingTree />
          ) : active.kind === 'all-changes' ? (
            <AllChangesView
              repoId={active.repoId}
              worktreePath={active.worktreePath}
              label={active.label}
            />
          ) : active.kind === 'run' ? (
            <RunView repoId={active.repoId} runId={active.runId} />
          ) : active.kind === 'commit' ? (
            <CommitDetailView repoId={active.repoId} sha={active.sha} worktreePath={active.worktreePath} />
          ) : (
            <ReviewView repoId={active.repoId} number={active.number} />
          )}

        </div>
      </div>
    </div>
  );
}

/**
 * The working-tree tab's body: the status read, then `StatusPanel`.
 *
 * `useStatus` carries `placeholderData: EMPTY_STATUS`, so it is never
 * `isPending` — an empty status is handed over on the first render and
 * replaced when the real one lands. That is why the skeleton keys on
 * `isPlaceholderData` instead: "the value on screen is a stand-in and a fetch
 * is out" is precisely the condition, and `isPending` would never once be
 * true. Without the distinction, a checkout with real changes would flash a
 * clean tree before showing them.
 */
function WorkingTree() {
  const status = useStatus();

  if (status.isError) {
    return (
      <EmptyState
        icon={VIEW_ICON.changes}
        title="Could not read the working tree"
        body={status.error instanceof Error ? status.error.message : String(status.error)}
      />
    );
  }

  if (status.isPlaceholderData && status.isFetching) return <WorkingTreeSkeleton />;

  return <StatusPanel />;
}

/**
 * The change list, at rest — a section heading and a few file rows, twice
 * (staged and unstaged), which is the shape `StatusPanel` paints. The counts
 * fill the pane and are not a claim about how many files have changed
 * (`components/skeleton.tsx`).
 */
function WorkingTreeSkeleton() {
  return (
    <LoadingRegion label="Reading the working tree…" className="flex h-full min-h-0 flex-col gap-4 p-3">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 shrink-0" />
              <Skeleton className="h-3" style={{ width: row % 2 === 0 ? '54%' : '38%' }} />
            </div>
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

/** The last path segment — a full absolute path would fill the whole strip. */
function workingTreeLabel(worktreePath: string | null): string {
  if (!worktreePath) return 'Working tree';
  const name = worktreePath.slice(worktreePath.lastIndexOf('/') + 1);
  return name.length > 0 ? name : 'Working tree';
}
