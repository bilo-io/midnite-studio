import { useState } from 'react';
import { GoBeaker } from 'react-icons/go';

import type { TestSuiteKind } from '@midnite/git-shared';

import { TREE_INDENT } from '../../components/tree-indent';
import { TreeSection } from '../../components/tree-section';
import { useTestDiscovery } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useTestsStore } from './tests-store';

const KIND_ORDER: readonly TestSuiteKind[] = [
  'unit',
  'integration',
  'e2e',
  'smoke',
  'lint',
  'typecheck',
  'other',
];

/**
 * A repository's discovered suites, grouped by kind — the sidebar's own
 * grouping, distinct from the Tests view's package tree. Unlike its three
 * siblings in `forge-sections.tsx`, discovery is cheap and safe to fetch
 * whether or not this section is open (it reads a handful of files, never a
 * subprocess), so there is no lazy-on-open gate here.
 *
 * Nested under Forge (Phase 28 Theme F) alongside Actions/Reviews/Issues —
 * `RepoTree`'s generic section walk gates visibility and `depth` for all
 * four uniformly, so this no longer checks its own visibility.
 */
export function TestsSection({ repoId, depth }: { repoId: string; depth: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const discovery = useTestDiscovery(repoId);
  const selectSuite = useTestsStore((s) => s.selectSuite);
  const selectRepo = useUiStore((s) => s.selectRepo);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const suites = discovery.data?.packages.flatMap((p) => p.suites) ?? [];
  const byKind = new Map<TestSuiteKind, typeof suites>();
  for (const suite of suites) {
    byKind.set(suite.kind, [...(byKind.get(suite.kind) ?? []), suite]);
  }

  const openSuite = (suiteId: string): void => {
    selectRepo(repoId);
    selectSuite(repoId, suiteId);
    setActiveView('tests');
  };

  return (
    <TreeSection
      title="Tests"
      count={open ? suites.length : undefined}
      icon={<GoBeaker aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={depth}
      hideWhenEmpty={false}
    >
      {suites.length === 0 ? (
        <p className={`${TREE_INDENT[(depth + 1) as 2 | 3]} py-1.5 pr-2 text-xs text-muted-foreground`}>
          {discovery.isFetching ? 'Scanning for test suites…' : 'No test suites discovered.'}
        </p>
      ) : (
        KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
          <div key={kind}>
            <p
              className={`${TREE_INDENT[(depth + 1) as 2 | 3]} py-1 pr-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70`}
            >
              {kind} · {byKind.get(kind)?.length}
            </p>
            {byKind.get(kind)?.map((suite) => (
              <button
                key={suite.id}
                type="button"
                onClick={() => openSuite(suite.id)}
                className={`flex w-full flex-col items-start gap-0 py-0.5 ${TREE_INDENT[(depth + 2) as 3 | 4]} pr-2 text-left text-[13px] transition-colors hover:bg-accent/30`}
              >
                <span className="truncate">{suite.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {suite.packageName}
                </span>
              </button>
            ))}
          </div>
        ))
      )}
    </TreeSection>
  );
}
