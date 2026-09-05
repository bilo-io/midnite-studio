import { useState } from 'react';

import type { Ecosystem, ScanCategory } from '@midnite/studio-shared';
import { LuFolderPlus, LuSparkles, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { formatBytes } from '../monitor/format-bytes';
import { CircularGauge } from './components/circular-gauge';
import { CATEGORY_LABELS, CATEGORY_ORDER, categoryColor, ECOSYSTEM_LABELS, ECOSYSTEM_ORDER } from './category-palette';
import { runOptimizerClean, runOptimizerScan } from './use-optimizer';
import { useOptimizerStore } from '../../store/optimizer-store';

/** Caps the producers line so the confirm box cannot grow unbounded. */
const MAX_PRODUCERS_SHOWN = 4;
/** Caps the truncated-roots line the same way. */
const MAX_TRUNCATED_ROOTS_SHOWN = 3;

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** `a`, `a and b`, or `a, b and c` — Oxford-comma-free. */
function joinAnd(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/** `joinAnd`, capped, with `, and N more` appended past the cap. */
function joinProducers(values: readonly string[], max: number): string {
  if (values.length <= max) return joinAnd(values);
  const shown = values.slice(0, max);
  return `${joinAnd(shown)}, and ${values.length - shown.length} more`;
}

/** Plain comma join, capped, with `and N more` appended past the cap. */
function joinTruncatedRoots(values: readonly string[], max: number): string {
  const shown = values.slice(0, max);
  const rest = values.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
}

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

  /**
   * The per-row action (Decision 4): cleans one (ecosystem, category) pair.
   * Scoped by ecosystem, not just category — `buildOutput` for instance
   * shows up under six different ecosystem groups, and an unscoped clean
   * would take every ecosystem's build output with it. This is what
   * "reclaiming a `costly` item takes an explicit per-row action" means in
   * practice: the group's own bulk Clean button below skips `costly`
   * categories entirely, so this per-row button is the only path to them.
   */
  const cleanGroupCategory = (ecosystem: Ecosystem, category: ScanCategory) => {
    if (!result) return;
    const items = result.items.filter(
      (item) => item.ecosystem === ecosystem && item.category === category,
    );
    if (items.length === 0) return;
    const paths = items.map((item) => item.path);
    const bytes = items.reduce((sum, item) => sum + item.bytes, 0);

    dialogs.confirm({
      title: `Clean ${CATEGORY_LABELS[category]}?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: items.length, sample: [] },
      blastRadiusKind: 'files',
      warnings: [`${formatBytes(bytes)} will be freed.`],
      onConfirm: () => {
        void runOptimizerClean(paths);
      },
    });
  };

  /**
   * The per-group bulk action. Cleans only this ecosystem's `reclaim ===
   * 'cheap'` items (Decision 4) — a `costly` item (`node_modules`, `.venv`,
   * `Pods`, `vendor/bundle`) is never swept up by one click; the group's own
   * Clean button is `disabled` when every item in it is `costly`.
   */
  const cleanEcosystem = (ecosystem: Ecosystem) => {
    if (!result) return;
    const groupItems = result.items.filter((item) => item.ecosystem === ecosystem);
    const cheapItems = groupItems.filter((item) => item.reclaim === 'cheap');
    if (cheapItems.length === 0) return;
    const costlyItems = groupItems.filter((item) => item.reclaim === 'costly');

    const paths = cheapItems.map((item) => item.path);
    const bytes = cheapItems.reduce((sum, item) => sum + item.bytes, 0);

    const producers = [
      ...new Set(
        cheapItems
          .map((item) => result.detectors[item.detectorId]?.producer)
          .filter((producer): producer is string => Boolean(producer)),
      ),
    ];

    // Bytes first, then producers, then the costly-skipped line — the order
    // a user reads them: what I gain, what it costs, what I did not get.
    const warnings = [`${formatBytes(bytes)} will be freed.`];
    if (producers.length > 0) {
      warnings.push(`${joinProducers(producers, MAX_PRODUCERS_SHOWN)} will need to run again.`);
    }
    if (costlyItems.length > 0) {
      warnings.push(
        `${costlyItems.length} item${costlyItems.length === 1 ? '' : 's'} need a re-download to restore and were left alone — clean them individually.`,
      );
    }

    dialogs.confirm({
      title: `Clean ${ECOSYSTEM_LABELS[ecosystem]}?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: cheapItems.length, sample: [] },
      blastRadiusKind: 'files',
      warnings,
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
                ? result.items.length === 0
                  ? 'Nothing to reclaim — every repo this app manages is already clean.'
                  : formatBytes(result.totalBytes) + ' reclaimable'
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

      {result && result.items.length > 0 ? (
        <ul className="w-full max-w-md space-y-3">
          {ECOSYSTEM_ORDER.map((ecosystem) => {
            const ecoBytes = result.byEcosystem[ecosystem] ?? 0;
            if (ecoBytes === 0) return null;
            const groupItems = result.items.filter((item) => item.ecosystem === ecosystem);
            const cheapCount = groupItems.filter((item) => item.reclaim === 'cheap').length;

            return (
              <li key={ecosystem} className="rounded-md border border-border">
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {ECOSYSTEM_LABELS[ecosystem]}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatBytes(ecoBytes)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cleanEcosystem(ecosystem)}
                    disabled={cheapCount === 0}
                    aria-label={`Clean ${ECOSYSTEM_LABELS[ecosystem]}`}
                    title={
                      cheapCount === 0
                        ? 'Every item here needs a re-download to restore — clean them individually.'
                        : undefined
                    }
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clean
                  </button>
                </div>
                <ul className="space-y-1 border-t border-border/60 px-3 py-2">
                  {CATEGORY_ORDER.map((category) => {
                    const categoryItems = groupItems.filter((item) => item.category === category);
                    if (categoryItems.length === 0) return null;
                    const bytes = categoryItems.reduce((sum, item) => sum + item.bytes, 0);
                    const count = categoryItems.length;
                    return (
                      <li
                        key={category}
                        className="flex items-center justify-between gap-2 py-0.5"
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
                          onClick={() => cleanGroupCategory(ecosystem, category)}
                          aria-label={`Clean ${ECOSYSTEM_LABELS[ecosystem]} ${CATEGORY_LABELS[category]}`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          Clean
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : null}

      {result?.truncated ? (
        <p className="text-xs text-muted-foreground">
          This scan hit its bounds and stopped early — some reclaimable space may not be shown.
          {result.truncatedRoots.length > 0
            ? ` Cut short: ${joinTruncatedRoots(
                result.truncatedRoots.map(basename),
                MAX_TRUNCATED_ROOTS_SHOWN,
              )}.`
            : null}
        </p>
      ) : null}
    </div>
  );
}
