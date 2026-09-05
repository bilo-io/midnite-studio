import { useState } from 'react';

import type { ScanCategory } from '@midnite/studio-shared';
import { LuFolderPlus, LuSparkles, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { formatBytes } from '../monitor/format-bytes';
import { CircularGauge } from './components/circular-gauge';
import { CATEGORY_LABELS, categoryColor } from './category-palette';
import { runOptimizerClean, runOptimizerScan } from './use-optimizer';
import { useOptimizerStore } from '../../store/optimizer-store';

const CATEGORY_ORDER: readonly ScanCategory[] = [
  'nodeModules',
  'buildOutput',
  'staleWorktree',
  'looseObjects',
];

export function SmartScanTab() {
  const scan = useOptimizerStore((s) => s.scan);
  const dialogs = useDialogs();
  /**
   * Decision 3: known repos/worktrees plus one user-chosen extra root per
   * scan — never an unscoped crawl. Kept as local state, not the store: it
   * is an input to the next scan, not a fact about the last one, and the
   * store's own shape is Theme A's fixed `{tab, scan, processes, gpu}`.
   */
  const [extraRoot, setExtraRoot] = useState<string | null>(null);

  const scanning = scan.state === 'scanning';
  const result = scan.result;

  const chooseExtraRoot = async () => {
    const path = await bridge()?.repos.pickDirectory();
    if (path) setExtraRoot(path);
  };

  const cleanCategory = (category: ScanCategory) => {
    if (!result) return;
    const items = result.items.filter((item) => item.category === category);
    if (items.length === 0) return;
    const paths = items.map((item) => item.path);
    const bytes = items.reduce((sum, item) => sum + item.bytes, 0);

    dialogs.confirm({
      title: `Clean ${CATEGORY_LABELS[category]}?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      // Decision 7: the item count goes in `blastRadius.count` (rendered
      // through `blastRadiusKind: 'files'`, since `sample` is git-only and
      // there is nothing shaped like a commit to put in it here) and the
      // byte figure — a consequence not measured in commits — goes in
      // `warnings`. Nothing to count asynchronously: both numbers are
      // already known from the scan, so there is no "Checking what this
      // affects…" step to show.
      blastRadius: { count: items.length, sample: [] },
      blastRadiusKind: 'files',
      warnings: [`${formatBytes(bytes)} will be freed.`],
      onConfirm: () => {
        void runOptimizerClean(paths);
      },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3 py-4">
        {scanning ? (
          <CircularGauge percent={scan.progress} label="Scanning" />
        ) : (
          <button
            type="button"
            aria-label="Run Smart Scan"
            onClick={() => void runOptimizerScan(extraRoot ?? undefined)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <LuSparkles aria-hidden className="h-7 w-7" />
          </button>
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {scanning ? 'Scanning…' : result ? 'Scan complete' : 'Smart Scan'}
          </p>
          <p className="text-xs text-muted-foreground">
            {scanning
              ? 'Walking every registered repo and worktree.'
              : result
                ? formatBytes(result.totalBytes) + ' reclaimable'
                : 'Finds reclaimable space across every repo this app manages.'}
          </p>
        </div>

        {/*
          Decision 3: known repos/worktrees plus exactly one user-chosen
          extra root per scan — never an unscoped crawl. Disabled mid-scan so
          the choice can't change out from under a running walk.
        */}
        {extraRoot ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs">
            <span className="max-w-[240px] truncate font-mono text-foreground">{extraRoot}</span>
            <button
              type="button"
              onClick={() => setExtraRoot(null)}
              disabled={scanning}
              aria-label="Remove extra scan folder"
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <LuX aria-hidden className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void chooseExtraRoot()}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <LuFolderPlus aria-hidden className="h-3.5 w-3.5" />
            Add a folder to scan
          </button>
        )}

        {scan.state === 'error' ? (
          <p className="text-xs text-destructive">{scan.message}</p>
        ) : null}
      </div>

      {result ? (
        <ul className="w-full max-w-md space-y-2">
          {CATEGORY_ORDER.map((category) => {
            const bytes = result.byCategory[category] ?? 0;
            const count = result.items.filter((item) => item.category === category).length;
            if (count === 0) return null;
            return (
              <li
                key={category}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: categoryColor(category) }}
                  />
                  <div>
                    <p className="text-sm text-foreground">{CATEGORY_LABELS[category]}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} item{count === 1 ? '' : 's'} — {formatBytes(bytes)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cleanCategory(category)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Clean
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {result?.truncated ? (
        <p className="text-xs text-muted-foreground">
          This scan hit its bounds and stopped early — some reclaimable space may not be shown.
        </p>
      ) : null}
    </div>
  );
}
