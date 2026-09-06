import { useMemo, useState } from 'react';

import type { Ecosystem, ScanCategory, ScanItem } from '@midnite/studio-shared';
import { LuCheck, LuChevronDown, LuChevronRight, LuFolderPlus, LuSparkles, LuX } from 'react-icons/lu';
import { PiBroom } from 'react-icons/pi';

import { useDialogs } from '../../components/dialog-host';
import { EXPAND_ALL_LIMIT } from '../changes/expansion';
import { bridge } from '../../services/bridge';
import { formatBytes } from '../monitor/format-bytes';
import { TIMELINE_METRICS } from '../monitor/metric-geometry';
import { buildSizeTree, type SizeTreeNode } from './build-size-tree';
import { CircularGauge } from './components/circular-gauge';
import { OptimizerMetrics } from './components/optimizer-metrics';
import { EXPAND_ALL, SizeTree } from './components/size-tree';
import { CATEGORY_LABELS, CATEGORY_ORDER, categoryColor, ECOSYSTEM_LABELS, ECOSYSTEM_ORDER, ecosystemColor } from './category-palette';
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

/**
 * The clean action, as a broom that grows a word.
 *
 * Every row and every group header carries one of these, and five stacked
 * "Clean" buttons is five copies of the same word competing with the byte
 * figures that are the actual content. Icon at rest, label on hover or focus
 * — and the accessible name is the full `Clean <group>` either way, so what a
 * screen reader hears never depends on where the pointer is.
 */
function CleanButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className="group/clean inline-flex shrink-0 items-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <PiBroom aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span
        aria-hidden
        className="inline-flex w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 group-hover/clean:ml-1 group-hover/clean:w-9 group-hover/clean:opacity-100 group-focus-visible/clean:ml-1 group-focus-visible/clean:w-9 group-focus-visible/clean:opacity-100"
      >
        Clean
      </span>
    </button>
  );
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
  /** Which ecosystem accordions the user has explicitly opened or closed. */
  const [openGroups, setOpenGroups] = useState<Partial<Record<Ecosystem, boolean>>>({});

  const scanning = scan.state === 'scanning';
  const result = scan.result;
  /**
   * Whether the hero has done its job. Drives the whole layout: before a
   * scan it is a large, drifting, centred target and the tab has nothing
   * else on it; afterwards it shrinks to a header mark above the results.
   * The size and padding are a `transition-all` on the same element rather
   * than two elements swapped, so it visibly travels rather than cutting.
   */
  const settled = Boolean(result) || scanning;

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

  /** The single-item action, from a leaf of the drill-down tree. */
  const cleanItemPath = (path: string, bytes: number, label: string) => {
    dialogs.confirm({
      title: `Clean ${label}?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: 1, sample: [] },
      blastRadiusKind: 'files',
      warnings: [`${formatBytes(bytes)} will be freed.`, path],
      onConfirm: () => {
        void runOptimizerClean([path]);
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

  /**
   * The grouped items and their tries, built once per scan.
   *
   * Inline in JSX this was `items.filter(...)` twice plus a `buildSizeTree`
   * per (ecosystem, category) pair on *every* render — an accordion toggle
   * rebuilt every other group's trie too, and a scan is capped at 2,000
   * items (`SCAN_ITEMS_CAP`), not a handful.
   */
  const grouped = useMemo(() => {
    if (!result) return [];
    return ECOSYSTEM_ORDER.filter((ecosystem) => (result.byEcosystem[ecosystem] ?? 0) > 0).map(
      (ecosystem) => {
        const items = result.items.filter((item) => item.ecosystem === ecosystem);
        const categories = CATEGORY_ORDER.flatMap((category) => {
          const categoryItems = items.filter((item) => item.category === category);
          if (categoryItems.length === 0) return [];
          return [
            {
              category,
              items: categoryItems,
              bytes: categoryItems.reduce((sum, item) => sum + item.bytes, 0),
              tree: buildSizeTree(categoryItems) as SizeTreeNode<ScanItem>[],
            },
          ];
        });
        return {
          ecosystem,
          bytes: result.byEcosystem[ecosystem] ?? 0,
          items,
          cheapCount: items.filter((item) => item.reclaim === 'cheap').length,
          categories,
        };
      },
    );
  }, [result]);
  // The biggest group opens by itself: a page of collapsed headers makes the
  // user click before the scan has told them anything.
  const defaultOpen = grouped[0]?.ecosystem;
  const isOpen = (ecosystem: Ecosystem) => openGroups[ecosystem] ?? ecosystem === defaultOpen;

  return (
    <div className="flex flex-col items-center gap-6">
      {/*
        The system monitor strip — what the machine was doing while the scan
        walked every registered repo, which is the context for how long it
        took. Only once a scan is running or done, though: before that the
        hero is deliberately the only thing on the tab, and a metrics card
        above it would be the first thing read on an empty Smart Scan.
      */}
      {settled ? (
        <div className="w-full max-w-3xl">
          <OptimizerMetrics metrics={TIMELINE_METRICS} compact title="While you scan" />
        </div>
      ) : null}

      <div
        className={`flex flex-col items-center gap-3 transition-all duration-500 ease-out ${
          settled ? 'py-2' : 'py-10'
        }`}
      >
        {scanning ? (
          <CircularGauge percent={scan.progress} label="Scanning" />
        ) : (
          <button
            type="button"
            aria-label={result ? 'Run Smart Scan again' : 'Run Smart Scan'}
            onClick={() => void runOptimizerScan(extraRoot ?? undefined)}
            className={`group/hero relative flex items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground transition-all duration-500 ease-out hover:opacity-90 ${
              result ? 'h-16 w-16' : 'h-32 w-32'
            }`}
          >
            {/*
              The drifting gradient, only before a scan. Three radial layers
              on their own slow, never-repeating periods (styles.css) — the
              button is the only thing on the tab at that point, and a flat
              disc reads as decoration rather than the one thing to press.
            */}
            {result ? null : (
              <span aria-hidden className="optimizer-hero-drift absolute inset-0">
                <span />
                <span />
                <span />
              </span>
            )}

            {result ? (
              <>
                {/*
                  A checkmark that turns back into the star on hover — the
                  mark says "done", the hover says "and you can do it again",
                  which is exactly what clicking it now means.
                */}
                <LuCheck
                  aria-hidden
                  className="absolute h-7 w-7 transition-opacity duration-150 group-hover/hero:opacity-0"
                />
                <LuSparkles
                  aria-hidden
                  className="absolute h-7 w-7 opacity-0 transition-opacity duration-150 group-hover/hero:opacity-100"
                />
              </>
            ) : (
              <LuSparkles aria-hidden className="relative h-14 w-14" />
            )}
          </button>
        )}

        <div className="text-center">
          <p
            className={
              result || scanning
                ? 'text-sm font-medium text-foreground'
                : 'optimizer-text-shimmer text-xl font-semibold'
            }
          >
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
            className="optimizer-soft-glow flex items-center gap-1.5 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/70 hover:bg-accent disabled:opacity-50"
          >
            <LuFolderPlus aria-hidden className="h-4 w-4" />
            Add a folder to scan
          </button>
        )}

        {scan.state === 'error' ? (
          <p className="text-xs text-destructive">{scan.message}</p>
        ) : null}
      </div>

      {result && result.items.length > 0 ? (
        <ul className="w-full max-w-3xl space-y-2">
          {grouped.map(({ ecosystem, bytes: ecoBytes, items: groupItems, cheapCount, categories }) => {
            const open = isOpen(ecosystem);

            return (
              <li key={ecosystem} className="overflow-hidden rounded-md border border-border">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [ecosystem]: !open }))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <LuChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <LuChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ecosystemColor(ecosystem) }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {ECOSYSTEM_LABELS[ecosystem]}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {`${formatBytes(ecoBytes)} — ${groupItems.length} item${groupItems.length === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </button>
                  <CleanButton
                    label={`Clean ${ECOSYSTEM_LABELS[ecosystem]}`}
                    onClick={() => cleanEcosystem(ecosystem)}
                    disabled={cheapCount === 0}
                    title={
                      cheapCount === 0
                        ? 'Every item here needs a re-download to restore — clean them individually.'
                        : undefined
                    }
                  />
                </div>

                {open ? (
                  <div className="space-y-2 border-t border-border/60 px-3 py-2">
                    {categories.map(({ category, items: categoryItems, bytes, tree }) => {
                      const count = categoryItems.length;

                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between gap-2 py-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: categoryColor(category) }}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm text-foreground">
                                  {CATEGORY_LABELS[category]}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {`${count} item${count === 1 ? '' : 's'} — ${formatBytes(bytes)}`}
                                </p>
                              </div>
                            </div>
                            <CleanButton
                              label={`Clean ${ECOSYSTEM_LABELS[ecosystem]} ${CATEGORY_LABELS[category]}`}
                              onClick={() => cleanGroupCategory(ecosystem, category)}
                            />
                          </div>

                          {/*
                            The drill-down: the actual paths, as a tree, so a
                            group of forty `dist/` directories is navigable
                            rather than forty near-identical lines. Leaves
                            clean one path each — the only per-item path to a
                            `costly` item, which no bulk button will take.
                          */}
                          <div className="ml-4 border-l border-border/60 pl-2">
                            <SizeTree
                              nodes={tree}
                              // `EXPAND_ALL_LIMIT` is the repo's standing
                              // answer to "how many rows may one click open"
                              // (features/changes/expansion.ts): a small
                              // group opens to its leaves, a
                              // hundreds-of-items group opens one level and
                              // is drilled by hand.
                              defaultExpandedDepth={count <= EXPAND_ALL_LIMIT ? EXPAND_ALL : 1}
                              leafDot={(item) => categoryColor(item.category)}
                              leafLabel={(item) =>
                                result.detectors[item.detectorId]?.label ?? item.detectorId
                              }
                              leafAction={(item) => (
                                <CleanButton
                                  label={`Clean ${item.path}`}
                                  onClick={() =>
                                    cleanItemPath(
                                      item.path,
                                      item.bytes,
                                      result.detectors[item.detectorId]?.label ?? item.detectorId,
                                    )
                                  }
                                />
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
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
