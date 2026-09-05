import type { ScanCategory } from '@midnite/studio-shared';

import { useOptimizerStore } from '../../store/optimizer-store';
import { useUiStore } from '../../store/ui-store';
import { formatBytes } from '../monitor/format-bytes';
import { SegmentedBar } from './components/segmented-bar';
import { CATEGORY_LABELS, categoryColor } from './category-palette';

const CATEGORY_ORDER: readonly ScanCategory[] = [
  'nodeModules',
  'buildOutput',
  'staleWorktree',
  'looseObjects',
];

export function StorageTab() {
  const result = useOptimizerStore((s) => s.scan.result);
  const selectRepo = useUiStore((s) => s.selectRepo);

  if (!result) {
    return (
      <p className="text-sm text-muted-foreground">
        Run a Smart Scan first — Storage shows the same result as a breakdown.
      </p>
    );
  }

  const segments = CATEGORY_ORDER.filter((category) => (result.byCategory[category] ?? 0) > 0).map(
    (category) => ({ id: category, bytes: result.byCategory[category] ?? 0 }),
  );

  return (
    <div className="flex flex-col gap-4">
      <SegmentedBar label="Reclaimable storage by category" total={result.totalBytes} segments={segments} />

      <ul className="space-y-1">
        {result.items.map((item) => (
          <li
            key={item.path}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
          >
            <button
              type="button"
              // Deep-links to the repo in the sidebar. Items sit at arbitrary
              // depth under a worktree, so only the owning repo (not the
              // exact worktree) is a reliable target to select.
              onClick={() => item.repoId && selectRepo(item.repoId)}
              disabled={!item.repoId}
              className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(item.category) }}
              />
              <span className="truncate font-mono text-xs text-foreground">{item.path}</span>
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.bytes)}</span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {CATEGORY_ORDER.map((category) => (
          <li key={category} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: categoryColor(category) }}
            />
            {CATEGORY_LABELS[category]}
          </li>
        ))}
      </ul>
    </div>
  );
}
