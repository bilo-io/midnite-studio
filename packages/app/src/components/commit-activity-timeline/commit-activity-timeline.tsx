import { useCallback, useMemo, useState } from 'react';

import {
  bucketCommits,
  gridlineIndices,
  type ActivityTimeframe,
  type CommitActivity,
} from './activity-buckets';
import { ActivityTooltip, type PointerAt } from './activity-tooltip';

/**
 * How a bucket is drawn. All three read the same buckets; the choice is a
 * Settings preference, like the graph's own style.
 */
export type ActivityTimelineStyle = 'bars' | 'heatmap' | 'area';

/**
 * How the churn bars split additions from deletions.
 *
 * `diverging` grows them in opposite directions off a centre baseline —
 * compact, and it reads net churn at a glance. `grouped` stands them side by
 * side off the same edge, which is the layout to pick when the question is
 * "which was bigger" rather than "what shape was the day": a diverging pair is
 * two lengths measured from a shared middle, and comparing them means comparing
 * across a line, which the eye is bad at.
 */
export type ActivityBarLayout = 'diverging' | 'grouped';

/**
 * How the churn areas relate the two series.
 *
 * `overlaid` draws both off the same baseline, translucent, one over the other:
 * two heights measured from one zero, so "was this day more additions or more
 * deletions" is a direct comparison. `stacked` sits additions on top of
 * deletions, so the silhouette is total churn and the two bands are its split —
 * the shape to pick when the question is "how busy was the week", at the cost
 * of the additions band no longer being readable against the axis.
 */
export type ActivityAreaLayout = 'overlaid' | 'stacked';

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
  /** Rules across the time axis, at the timeframe's own cadence. */
  gridlines?: boolean;
  barLayout?: ActivityBarLayout;
  areaLayout?: ActivityAreaLayout;
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
 *
 * The hover layer is one transparent rect per bucket, laid over the marks and
 * spanning the *full* slot including its gap, so the gutter between two bars is
 * not a dead zone the tooltip flickers through.
 */
export function CommitActivityTimeline({
  commits,
  timeframe,
  variant = 'bars',
  orientation = 'horizontal',
  gridlines = false,
  barLayout = 'diverging',
  areaLayout = 'overlaid',
  now,
}: CommitActivityTimelineProps) {
  const buckets = useMemo(
    () => bucketCommits(commits, timeframe, now ?? Date.now()),
    [commits, timeframe, now],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const [pointer, setPointer] = useState<PointerAt>({ x: 0, y: 0 });

  /*
    Anchored per bucket, not per pixel: `onPointerMove` fires dozens of times a
    second and a state write per move re-renders every mark in the window (60 of
    them in the month view) plus the card's own measure pass. The card only ever
    describes the bucket, so it only needs to move when the bucket does.
  */
  const onHover = useCallback((index: number, event: { clientX: number; clientY: number }) => {
    setHovered((current) => {
      if (current !== index) setPointer({ x: event.clientX, y: event.clientY });
      return index;
    });
  }, []);

  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const hasChurn = buckets.some((bucket) => bucket.additions > 0 || bucket.deletions > 0);
  const windowLabel =
    timeframe === 'day' ? 'last 24 hours' : timeframe === 'week' ? 'last 7 days' : 'last 30 days';

  const horizontal = orientation === 'horizontal';
  const rules = gridlines ? gridlineIndices(buckets, timeframe) : [];
  const hoveredBucket = hovered === null ? undefined : buckets[hovered];

  return (
    <div className="relative h-full w-full">
      <svg
        role="img"
        aria-label={`Commit activity, ${windowLabel}: ${total} commit${total === 1 ? '' : 's'}`}
        data-testid="commit-activity-chart"
        data-variant={variant}
        viewBox={horizontal ? `0 0 ${AXIS} ${CROSS}` : `0 0 ${CROSS} ${AXIS}`}
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        {gridlines ? (
          <Gridlines
            rules={rules}
            count={buckets.length}
            horizontal={horizontal}
            baseline={variant === 'bars' && hasChurn && barLayout === 'diverging'}
          />
        ) : null}
        {/*
          Guarded on the resolved bucket, not on `hovered !== null`: switching
          the timeframe under the pointer shrinks the window while the index
          stays put, and index 23 of a 7-bucket week would place the highlight
          off the viewBox entirely.
        */}
        {hoveredBucket ? (
          <Highlight index={hovered!} count={buckets.length} horizontal={horizontal} />
        ) : null}
        {variant === 'bars' ? <Bars buckets={buckets} horizontal={horizontal} layout={barLayout} /> : null}
        {variant === 'heatmap' ? <Heatmap buckets={buckets} horizontal={horizontal} /> : null}
        {variant === 'area' ? (
          <ChurnArea buckets={buckets} horizontal={horizontal} layout={areaLayout} />
        ) : null}
        <HoverLayer buckets={buckets} horizontal={horizontal} onHover={onHover} onLeave={() => setHovered(null)} />
      </svg>
      {hoveredBucket ? (
        <ActivityTooltip
          bucket={hoveredBucket}
          timeframe={timeframe}
          windowCommits={total}
          hasChurn={hasChurn}
          at={pointer}
        />
      ) : null}
    </div>
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
 * Rules across the time axis at the bucket edges `gridlineIndices` picked, plus
 * — for diverging bars only — the centre baseline the two halves grow off.
 *
 * `vectorEffect="non-scaling-stroke"` for the same reason `Band` uses it: the
 * viewBox is stretched non-uniformly, so a scaled hairline is a different
 * thickness in each orientation and in each panel size.
 */
function Gridlines({
  rules,
  count,
  horizontal,
  baseline,
}: {
  rules: readonly number[];
  count: number;
  horizontal: boolean;
  baseline: boolean;
}) {
  const width = AXIS / count;
  // `span` is in the same "time × cross" vocabulary `place()` uses — never
  // x/y, which swap meaning between the orientations.
  const line = (
    along: number,
    across: number,
    span: { along: number; across: number },
    key: string,
    dashed: boolean,
  ) => {
    const [x1, y1] = horizontal ? [along, across] : [across, along];
    const [x2, y2] = horizontal
      ? [along + span.along, across + span.across]
      : [across + span.across, along + span.along];
    return (
      <line
        key={key}
        x1={r(x1)}
        y1={r(y1)}
        x2={r(x2)}
        y2={r(y2)}
        className="stroke-border"
        strokeWidth={1}
        strokeDasharray={dashed ? '2 3' : undefined}
        vectorEffect="non-scaling-stroke"
      />
    );
  };

  return (
    // A note about the axis, not a datum — the svg's own aria-label is what
    // reports the numbers, exactly as `metric-chart.tsx` treats its breaks.
    <g aria-hidden data-testid="activity-gridlines" opacity={0.7}>
      {rules.map((index) =>
        line(index * width, 0, { along: 0, across: CROSS }, `rule-${index}`, true),
      )}
      {baseline ? line(0, CROSS / 2, { along: AXIS, across: 0 }, 'baseline', false) : null}
    </g>
  );
}

/** The hovered slot's backdrop, drawn under the marks so it never hides them. */
function Highlight({
  index,
  count,
  horizontal,
}: {
  index: number;
  count: number;
  horizontal: boolean;
}) {
  const width = AXIS / count;
  return (
    <rect
      aria-hidden
      className="fill-foreground"
      opacity={0.07}
      {...place(horizontal, index * width, width, 0, CROSS)}
    />
  );
}

/**
 * One transparent hit rect per bucket, on top of everything.
 *
 * `fill="transparent"` and not `fill="none"`: "none" means *no paint*, and an
 * unpainted SVG shape does not receive pointer events at all, so the layer
 * would silently do nothing.
 */
function HoverLayer({
  buckets,
  horizontal,
  onHover,
  onLeave,
}: Drawn & {
  onHover: (index: number, event: { clientX: number; clientY: number }) => void;
  onLeave: () => void;
}) {
  const width = AXIS / buckets.length;
  return (
    <g aria-hidden onPointerLeave={onLeave}>
      {buckets.map((bucket, i) => (
        <rect
          key={bucket.start}
          fill="transparent"
          data-testid="activity-hit"
          onPointerEnter={(event) => onHover(i, event)}
          onPointerMove={(event) => onHover(i, event)}
          {...place(horizontal, i * width, width, 0, CROSS)}
        />
      ))}
    </g>
  );
}

/**
 * Churn bars, in one of two layouts.
 *
 * `diverging`: additions grow from the centre baseline toward one edge,
 * deletions toward the other. `grouped`: the slot is split in two and both
 * bars grow off the same "zero" edge, so their lengths are directly comparable.
 * Either way they scale against the window's largest single side.
 *
 * When no bucket carries line counts (churn absent, or nothing changed) the
 * bars fall back to commit counts off the far edge, in the neutral colour —
 * an empty chart would read as "no commits", which is not what happened.
 */
function Bars({ buckets, horizontal, layout }: Drawn & { layout: ActivityBarLayout }) {
  const maxLines = Math.max(...buckets.map((b) => Math.max(b.additions, b.deletions)), 0);

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

  if (layout === 'grouped') {
    return (
      <g data-testid="activity-bars-grouped">
        {buckets.map((bucket, i) => {
          const { along, length } = slot(i, buckets.length);
          // Half the slot each, with a hairline between them so two full-height
          // bars still read as two bars rather than one wide one.
          const each = (length - GROUP_GAP) / 2;
          const add = (bucket.additions / maxLines) * CROSS;
          const del = (bucket.deletions / maxLines) * CROSS;
          return (
            <g key={bucket.start}>
              {add > 0 ? (
                <rect
                  className="text-emerald-500"
                  fill="currentColor"
                  {...place(horizontal, along, each, CROSS - add, add)}
                />
              ) : null}
              {del > 0 ? (
                <rect
                  className="text-rose-500"
                  fill="currentColor"
                  {...place(horizontal, along + each + GROUP_GAP, each, CROSS - del, del)}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    );
  }

  const half = CROSS / 2;
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

/** Viewbox units between a grouped pair. Small — the pair must still read as one bucket. */
const GROUP_GAP = 0.3;

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

/**
 * Churn as two areas — additions in green, deletions in red — in one of two
 * layouts.
 *
 * `overlaid` draws both off the same baseline and scales them against the
 * window's largest single side, so the two heights compare directly. `stacked`
 * puts additions on top of deletions and scales against the largest *total*,
 * so the outline is total churn. Both are the same `Band` twice; only the
 * floor each band sits on and the number they scale against differ.
 *
 * Same fallback rule the bars have: with no line counts anywhere in the window
 * (churn absent, or nothing changed) it draws commit counts in the neutral
 * colour instead, because an empty chart would read as "no commits".
 */
function ChurnArea({ buckets, horizontal, layout }: Drawn & { layout: ActivityAreaLayout }) {
  const maxLines = Math.max(...buckets.map((b) => Math.max(b.additions, b.deletions)), 0);
  if (maxLines === 0) return <CountArea buckets={buckets} horizontal={horizontal} />;

  const stacked = layout === 'stacked';
  const max = stacked ? Math.max(...buckets.map((b) => b.additions + b.deletions)) : maxLines;

  const floor = buckets.map(() => 0);
  const deletions = buckets.map((b) => depth(b.deletions, max));
  // Deletions sit on the baseline in both layouts; stacking lifts additions
  // onto them, and overlaying starts them from the same zero.
  const addFloor = stacked ? deletions : floor;
  const additions = buckets.map((b, i) => addFloor[i]! + depth(b.additions, max));

  const bands = [
    // Deletions first — a fixed order rather than largest-first, so which
    // band is on top never moves as the window changes.
    { key: 'deletions', colour: 'text-rose-500', ...bandPaths(horizontal, floor, deletions) },
    { key: 'additions', colour: 'text-emerald-500', ...bandPaths(horizontal, addFloor, additions) },
  ];

  return (
    <Bands
      bands={bands}
      fillOpacity={stacked ? STACKED_FILL : OVERLAID_FILL}
      testId={stacked ? 'activity-area-stacked' : 'activity-area-overlaid'}
    />
  );
}

/** Commit counts as one neutral area — what the churn areas fall back to. */
function CountArea({ buckets, horizontal }: Drawn) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const top = buckets.map((b) => depth(b.count, maxCount));
  return (
    <Bands
      bands={[
        {
          key: 'counts',
          colour: 'text-muted-foreground',
          ...bandPaths(horizontal, buckets.map(() => 0), top),
        },
      ]}
      fillOpacity={0.15}
      testId="activity-area-counts"
    />
  );
}

/**
 * Every band's fill, then every band's edge.
 *
 * Both layers rather than one `<g>` per band, because an edge drawn under the
 * next band's fill is muted by it — and in the overlaid layout the two edges
 * are the only marks that stay readable where the bands cross.
 *
 * `vectorEffect="non-scaling-stroke"` because the viewBox is stretched
 * non-uniformly: a scaled hairline is a different thickness in each
 * orientation and at each panel size.
 */
function Bands({
  bands,
  fillOpacity,
  testId,
}: {
  bands: readonly { key: string; colour: string; area: string; line: string }[];
  fillOpacity: number;
  testId: string;
}) {
  return (
    <g data-testid={testId}>
      {bands.map((band) => (
        <path
          key={band.key}
          className={band.colour}
          d={band.area}
          fill="currentColor"
          opacity={fillOpacity}
        />
      ))}
      {bands.map((band) => (
        <path
          key={band.key}
          className={band.colour}
          d={band.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

/**
 * One band between two depth series: the filled shape, and its upper edge on
 * its own so the two can be drawn in separate layers.
 *
 * Depths, not coordinates: a series is "how far off the zero edge", which is
 * the vocabulary stacking is expressed in and the only one that survives the
 * orientation swap. `at()` turns a depth into the across-axis coordinate and
 * `pt()` decides which axis that lands on.
 */
function bandPaths(
  horizontal: boolean,
  floor: readonly number[],
  top: readonly number[],
): { area: string; line: string } {
  const alongs = alongPoints(top.length);
  const edge = (series: readonly number[]): string[] =>
    shoulder(series).map((d, i) => pt(horizontal, alongs[i]!, at(d)));

  const line = `M${edge(top).join(' L')}`;
  return { line, area: `${line} L${edge(floor).reverse().join(' L')} Z` };
}

/** Fill opacity per layout: overlaid bands have to read through each other. */
const OVERLAID_FILL = 0.28;
const STACKED_FILL = 0.5;

/** Inset from each end of the cross axis, so a full-height band's stroke is not clipped. */
const AREA_PAD = 1;

/** Depth of `value` against the window's `max`, in cross-axis units. */
const depth = (value: number, max: number): number =>
  max === 0 ? 0 : (value / max) * (CROSS - 2 * AREA_PAD);

/** Cross-axis coordinate of a depth, measured off the "zero" edge. */
const at = (value: number): number => CROSS - AREA_PAD - value;

/** An along/across pair as an SVG point, swapped for the vertical orientation. */
const pt = (horizontal: boolean, along: number, across: number): string =>
  horizontal ? `${r(along)},${r(across)}` : `${r(across)},${r(along)}`;

/**
 * Bucket centres along the time axis, with the two ends squared off to the
 * axis edges — a band drawn only between centres would leave half a bucket of
 * blank at each end, which reads as the window being narrower than it is.
 */
function alongPoints(count: number): number[] {
  const width = AXIS / count;
  return [0, ...Array.from({ length: count }, (_, i) => i * width + width / 2), AXIS];
}

/** The end values repeated, so the squared-off shoulders are flat. */
const shoulder = (series: readonly number[]): number[] => [
  series[0] ?? 0,
  ...series,
  series.at(-1) ?? 0,
];
