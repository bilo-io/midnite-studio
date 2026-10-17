import type { CommitDiffStat } from '@midnite/studio-shared';

export interface DiffChartCellProps {
  stat: CommitDiffStat | null | undefined;
  /** Maximum additions or deletions across the currently visible viewport slice. */
  maxLines: number;
}

/**
 * One commit's diff rendered as a diverging horizontal churn bar for the Diff Chart column.
 *
 * `undefined` is "not loaded yet" or off; `null` is a merge commit (em dash).
 * Additions grow left from the centre baseline (emerald), deletions grow right (rose).
 * The lengths scale relative to the visible viewport's max churn (`maxLines`).
 */
export function DiffChartCell({ stat, maxLines }: DiffChartCellProps) {
  if (stat === undefined) return null;
  if (stat === null) {
    return (
      <span className="text-muted-foreground" title="Merge commit — no diff shown">
        —
      </span>
    );
  }

  const title = `${stat.files} ${stat.files === 1 ? 'file' : 'files'} changed (+${stat.added}, −${stat.deleted})`;
  const safeMax = Math.max(maxLines, 1);
  const maxHalfWidth = 46;

  const hasAdd = stat.added > 0;
  const hasDel = stat.deleted > 0;

  const addFraction = stat.added / safeMax;
  const delFraction = stat.deleted / safeMax;

  // Minimum visible bar width of 1.5 units so a non-zero change is discernible even next to massive commits
  const addWidth = hasAdd ? Math.max(1.5, Math.min(maxHalfWidth, addFraction * maxHalfWidth)) : 0;
  const delWidth = hasDel ? Math.max(1.5, Math.min(maxHalfWidth, delFraction * maxHalfWidth)) : 0;

  const addX = 50 - addWidth;
  const delX = 50;

  return (
    <div
      className="flex h-full w-full items-center justify-center px-2"
      title={title}
      data-testid="diff-chart-cell-container"
    >
      <svg
        viewBox="0 0 100 12"
        className="h-3 w-full max-w-[84px] overflow-visible"
        aria-hidden="true"
      >
        {/* Centre diverging baseline */}
        <line
          x1="50"
          y1="1"
          x2="50"
          y2="11"
          className="stroke-border"
          strokeWidth="1"
          strokeOpacity="0.8"
        />
        {/* Additions (left of centre, emerald) */}
        {hasAdd ? (
          <rect
            x={addX}
            y="2"
            width={addWidth}
            height="8"
            rx="1"
            className="text-emerald-500"
            fill="currentColor"
            data-testid="diff-chart-add"
          />
        ) : null}
        {/* Deletions (right of centre, rose) */}
        {hasDel ? (
          <rect
            x={delX}
            y="2"
            width={delWidth}
            height="8"
            rx="1"
            className="text-rose-500"
            fill="currentColor"
            data-testid="diff-chart-del"
          />
        ) : null}
      </svg>
    </div>
  );
}
