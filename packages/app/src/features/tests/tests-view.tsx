import { LuRefreshCw } from 'react-icons/lu';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRefreshTestDiscovery, useTestDiscovery } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { SuiteDetail } from './suite-detail';
import { SuiteList } from './suite-list';
import { useTestsStore } from './tests-store';

/**
 * The Tests view: a package/suite tree, and one suite examined in depth.
 *
 * Follows the sidebar's repository selection, exactly as the Actions view
 * does — one repository at a time. Discovery is safe unprompted (it reads
 * `package.json`/`moon.yml` and config presence, executing nothing), so
 * unlike Actions there is no CLI-status gate to render around.
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

  return (
    <div className="flex h-full min-h-0">
      <div
        role="region"
        aria-label="Suites"
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
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

        {packages.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {discovery.isFetching ? 'Scanning for test suites…' : 'No test suites discovered.'}
          </p>
        ) : (
          <SuiteList
            packages={packages}
            selectedId={selected?.id ?? null}
            onSelect={(id) => selectSuite(repoId, id)}
          />
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the suite list" />

      {selected === null ? (
        <Notice>{discovery.isFetching ? 'Scanning for test suites…' : 'No suite selected.'}</Notice>
      ) : (
        <SuiteDetail repoId={repoId} suite={selected} />
      )}
    </div>
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
