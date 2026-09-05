import { LuRefreshCw } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { VIEW_ICON } from '../../components/nav-icons';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRefreshTestDiscovery, useTestDiscovery } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { SuiteDetail } from './suite-detail';
import { SuiteList } from './suite-list';
import { useTestsStore } from './tests-store';
import { PageDetachMark } from '../../components/page-detach-mark';

/**
 * The Tests view: a package/suite tree, and one suite examined in depth.
 *
 * Follows the sidebar's repository selection, exactly as the Actions view
 * does — one repository at a time. Discovery is safe unprompted (it reads
 * `package.json`/`moon.yml` and config presence, executing nothing), so
 * unlike Actions there is no CLI-status gate to render around.
 *
 * Discovery is checked in the house order — error → empty → skeleton →
 * content (`components/skeleton.tsx`). Before Phase 60 Theme C the whole
 * ladder was one string that read "Scanning for test suites…" whether the pass
 * was still running or had thrown, which is the exact confusion that ordering
 * exists to prevent.
 */
export function TestsView() {
  const { repoId } = useActiveWorktree();
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: layout.testsListWidth,
    onSize: (value) => setLayout('testsListWidth', value),
    initial: DEFAULT_LAYOUT.testsListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.testsListWidth,
  });

  const discovery = useTestDiscovery(repoId);
  const refresh = useRefreshTestDiscovery(repoId);

  const selectedId = useTestsStore((s) =>
    repoId === null ? null : (s.selectedSuite[repoId] ?? null),
  );
  const selectSuite = useTestsStore((s) => s.selectSuite);

  const packages = discovery.data?.packages ?? [];
  const allSuites = packages.flatMap((p) => p.suites);
  const selected = allSuites.find((s) => s.id === selectedId) ?? allSuites[0] ?? null;

  if (repoId === null) {
    return <Notice>Select a repository to see its test suites.</Notice>;
  }

  // Error first: a discovery pass that threw has an answer, and it is not
  // "scanning". `error.message` rather than a house sentence — the reason is
  // usually a path or a parse failure the user can act on.
  if (discovery.isError) {
    return (
      <EmptyState
        icon={VIEW_ICON.tests}
        title="Could not discover test suites"
        body={discovery.error instanceof Error ? discovery.error.message : String(discovery.error)}
      />
    );
  }

  // Then the skeleton, but only while there is genuinely nothing yet: a
  // refresh over a listing already on screen keeps the listing and spins the
  // toolbar's own button instead.
  if (discovery.isPending) return <SuitesSkeleton />;

  if (packages.length === 0) {
    return (
      <EmptyState
        icon={VIEW_ICON.tests}
        title="No test suites discovered"
        body="Nothing in this checkout looks like a test runner's configuration. Add one, or refresh once it exists."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div
        role="region"
        aria-label="Suites"
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
          <PageDetachMark role="tests" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Suites
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
            {allSuites.length}
          </span>
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh discovered suites"
            className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <LuRefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <SuiteList
          packages={packages}
          selectedId={selected?.id ?? null}
          onSelect={(id) => selectSuite(repoId, id)}
        />
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the suite list" />

      {selected === null ? (
        <Notice>No suite selected.</Notice>
      ) : (
        <SuiteDetail repoId={repoId} suite={selected} />
      )}
    </div>
  );
}

/**
 * The suite list, at rest, while the first discovery pass is still out.
 *
 * Shaped like the tree it replaces — a package heading and a few suite rows,
 * twice — rather than a spinner, because the layout is already known and a
 * spinner would throw that away. The counts fill the pane; they are not a
 * claim about how many suites this repo has (`components/skeleton.tsx`).
 */
function SuitesSkeleton() {
  return (
    <LoadingRegion label="Scanning for test suites…" className="flex h-full min-h-0 flex-col gap-3 p-3">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="ml-3 h-3" style={{ width: row % 2 === 0 ? '58%' : '44%' }} />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
