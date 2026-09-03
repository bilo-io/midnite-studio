import { useMemo } from 'react';

import {
  bucketCommits,
  type ActivityTimeframe,
  type CommitActivity,
} from './activity-buckets';

/**
 * How a bucket is drawn. All three read the same buckets; the choice is a
 * Settings preference, like the graph's own style.
 */
export type ActivityTimelineStyle = 'bars' | 'heatmap' | 'sparkline';

/**
 * Which way time flows: `horizontal` (oldest left) for the strip above the
 * status bar, `vertical` (oldest top) for the panel beside the repositories.
 */
export type ActivityTimelineOrientation = 'horizontal' | 'vertical';

export interface CommitActivityTimelineProps {
  commits: CommitActivity[];
  timeframe: ActivityTimeframe;
  variant?: ActivityTimelineStyle;
  orientation?: ActivityTimelineOrientation;
  /** Injectable clock, so a test or screenshot renders the same buckets twice. */
  now?: number;
}

/**
 * Commit activity over a window, as one distortable SVG.
 *
 * Hand-rolled like every other chart in the app (see `metric-chart.tsx` and
 * the calendar widget's header for why a charting library never earned its
 * place). The viewBox is a fixed 100-long axis with `preserveAspectRatio=
 * "none"`, so one set of path maths serves both orientations at any box the
 * layout grants — the vertical case is the horizontal case with x and y
 * swapped, which `place()` does in exactly one spot.
 */
export function CommitActivityTimeline({
  commits,
  timeframe,
  variant = 'bars',
  orientation = 'horizontal',
  now,
}: CommitActivityTimelineProps) {
  const buckets = useMemo(
    () => bucketCommits(commits, timeframe, now ?? Date.now()),
    [commits, timeframe, now],
  );

  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const windowLabel =
    timeframe === 'day' ? 'last 24 hours' : timeframe === 'week' ? 'last 7 days' : 'last 30 days';

  const horizontal = orientation === 'horizontal';
  return (
    <svg
      role="img"
      aria-label={`Commit activity, ${windowLabel}: ${total} commit${total === 1 ? '' : 's'}`}
      data-testid="commit-activity-chart"
      data-variant={variant}
      viewBox={horizontal ? `0 0 ${AXIS} ${CROSS}` : `0 0 ${CROSS} ${AXIS}`}
      preserveAspectRatio="none"
      className="h-full w-full"
    >
      {variant === 'bars' ? <Bars buckets={buckets} horizontal={horizontal} /> : null}
      {variant === 'heatmap' ? <Heatmap buckets={buckets} horizontal={horizontal} /> : null}
      {variant === 'sparkline' ? <Sparkline buckets={buckets} horizontal={horizontal} /> : null}
    </svg>
  );
}

/** ViewBox length along time and across it. Arbitrary units — the box stretches. */
const AXIS = 100;
const CROSS = 32;

/** Fraction of each slot left as the gap between bars/cells. */
const GAP = 0.15;

type Drawn = { buckets: readonly Bucket[]; horizontal: boolean };
type Bucket = ReturnType<typeof bucketCommits>[number];

/**
 * An axis-aligned box in "time × cross" coordinates, emitted as SVG x/y/w/h.
 *
 * `along` runs oldest → newest. Horizontally that is left → right as-is;
 * vertically it is top → bottom, with the axes swapped.
 */
function place(
  horizontal: boolean,
  along: number,
  length: number,
  across: number,
  depth: number,
): { x: number; y: number; width: number; height: number } {
  return horizontal
    ? { x: r(along), y: r(across), width: r(length), height: r(depth) }
    : { x: r(across), y: r(along), width: r(depth), height: r(length) };
}

const r = (value: number): number => Math.round(value * 100) / 100;

/** Per-bucket slot position and drawable length along the time axis. */
function slot(index: number, count: number): { along: number; length: number } {
  const width = AXIS / count;
  return { along: index * width + (width * GAP) / 2, length: width * (1 - GAP) };
}

/**
 * Churn bars: additions grow from the centre baseline toward one edge,
 * deletions toward the other, each scaled against the window's largest side.
 * When no bucket carries line counts (churn absent, or nothing changed) the
 * bars fall back to commit counts off the far edge, in the neutral colour —
 * an empty chart would read as "no commits", which is not what happened.
 */
function Bars({ buckets, horizontal }: Drawn) {
  const maxLines = Math.max(...buckets.map((b) => Math.max(b.additions, b.deletions)), 0);
  const half = CROSS / 2;

  if (maxLines === 0) {
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    return (
      <g className="text-muted-foreground" fill="currentColor" opacity={0.7}>
        {buckets.map((bucket, i) => {
          if (bucket.count === 0) return null;
          const { along, length } = slot(i, buckets.length);
          const depth = (bucket.count / maxCount) * CROSS;
          return <rect key={bucket.start} {...place(horizontal, along, length, CROSS - depth, depth)} />;
        })}
      </g>
    );
  }

  return (
    <g>
      {buckets.map((bucket, i) => {
        const { along, length } = slot(i, buckets.length);
        const add = (bucket.additions / maxLines) * half;
        const del = (bucket.deletions / maxLines) * half;
        return (
          <g key={bucket.start}>
            {add > 0 ? (
              <rect
                className="text-emerald-500"
                fill="currentColor"
                {...place(horizontal, along, length, half - add, add)}
              />
            ) : null}
            {del > 0 ? (
              <rect
                className="text-rose-500"
                fill="currentColor"
                {...place(horizontal, along, length, half, del)}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/**
 * One cell per bucket, shaded by commit count. A floor under the non-zero
 * opacity keeps a one-commit bucket visible next to a fifty-commit one, and
 * empty buckets still draw — faintly — because the gaps are the information.
 */
function Heatmap({ buckets, horizontal }: Drawn) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <g className="text-emerald-500" fill="currentColor">
      {buckets.map((bucket, i) => {
        const { along, length } = slot(i, buckets.length);
        const opacity = bucket.count === 0 ? 0.08 : 0.25 + 0.75 * (bucket.count / maxCount);
        return (
          <rect
            key={bucket.start}
            opacity={r(opacity)}
            {...place(horizontal, along, length, 1, CROSS - 2)}
          />
        );
      })}
    </g>
  );
}

/** Commit counts as a line with a translucent fill, one point per bucket centre. */
function Sparkline({ buckets, horizontal }: Drawn) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const pad = 1;

  const points = buckets.map((bucket, i) => {
    const width = AXIS / buckets.length;
    const along = i * width + width / 2;
    const across = pad + (1 - bucket.count / maxCount) * (CROSS - 2 * pad);
    return horizontal ? `${r(along)},${r(across)}` : `${r(across)},${r(along)}`;
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  // Closed toward the "zero" edge: bottom when horizontal, left when vertical.
  const area = horizontal
    ? `${line} L${AXIS},${CROSS} L0,${CROSS} Z`
    : `${line} L${CROSS},${AXIS} L${CROSS},0 Z`;

  return (
    <g className="text-primary">
      <path d={area} fill="currentColor" opacity={0.15} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
