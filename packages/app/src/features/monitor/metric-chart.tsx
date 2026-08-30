import type { MetricId } from '@midnite/studio-shared';

import type { MetricPoint } from '../../store/metrics-store';
import { CHART_GEOMETRY, type MetricGeometry } from './metric-geometry';
import { METRIC_LABELS, metricColor, metricFill } from './metric-palette';
import { areaPath, cadenceBreaks, linePath } from './metric-path';

/**
 * A stacked area chart, hand-rolled.
 *
 * `@bilo-io/ui` ships an `AreaChart` and it is already installed — this does
 * not use it, consistently with the app hand-rolling its tab strip, its tooltip
 * and its theme toggle, and with metric colours being data rather than
 * design-system semantics. There is no y-scaling pass to write (the domain is
 * fixed at 0–100 by the contract) and no axis to lay out, which leaves about
 * forty lines of path maths against a component whose styling would have to be
 * fought back to the app's own palette. If the library version turns out
 * strictly better, swapping is a component change, not an architecture one.
 */

export type ChartSeries = {
  id: MetricId;
  points: readonly MetricPoint[];
};

export function MetricChart({
  series,
  geometry = CHART_GEOMETRY,
  showBreaks = true,
  label,
}: {
  series: readonly ChartSeries[];
  geometry?: MetricGeometry;
  /** Faint rules where the sampling cadence changed. */
  showBreaks?: boolean;
  /** Accessible name. The chart itself carries no readable text. */
  label: string;
}) {
  const drawable = series.filter((entry) => entry.points.length > 0);
  if (drawable.length === 0) return null;

  /*
    Every area first, then every line.

    Painted series-by-series, a later fill lands on top of an earlier stroke and
    buries it — the first series' line disappears wherever the second one
    overlaps it, which looks like a rendering bug and is actually paint order.
    Two passes is the whole fix.
  */
  const lineOrder = [...drawable].reverse();

  // The longest series decides where the cadence rules go; a series that
  // started late has fewer points and its indices would place them wrongly.
  const longest = drawable.reduce((best, entry) =>
    entry.points.length > best.points.length ? entry : best,
  );
  const breaks = showBreaks ? cadenceBreaks(longest.points, geometry) : [];

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-16 w-full"
    >
      {breaks.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={0}
          y2={geometry.height}
          className="stroke-border"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          // The rule is a note about the x-axis, not a datum; the caption
          // beside the chart is what explains it to a screen reader.
          aria-hidden
        >
          <title>Sampling cadence changed here</title>
        </line>
      ))}

      {drawable.map((entry) => (
        <path
          key={`area-${entry.id}`}
          d={areaPath(entry.points, geometry)}
          fill={metricFill(entry.id, geometry.areaAlpha)}
        />
      ))}

      {/*
        Reversed so the FIRST series in the caller's order paints last and
        therefore sits on top. The caller orders by what it wants read first.
      */}
      {lineOrder.map((entry) => (
        <path
          key={`line-${entry.id}`}
          d={linePath(entry.points, geometry)}
          fill="none"
          stroke={metricColor(entry.id)}
          strokeWidth={geometry.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          // The viewBox is stretched non-uniformly to fill the width, which
          // would otherwise stretch the stroke with it.
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** The swatch + name + current value line under a chart. */
export function ChartLegend({
  entries,
}: {
  entries: readonly { id: MetricId; value: number | null; detail?: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-1">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: metricColor(entry.id) }}
          />
          <span>{METRIC_LABELS[entry.id]}</span>
          {/*
            An unreadable metric says so. Rendering "0%" here would be the same
            lie the contract's optional fields exist to prevent, one layer up.
          */}
          <span className="tabular-nums text-foreground">
            {entry.value === null ? 'n/a' : `${Math.round(entry.value)}%`}
          </span>
          {entry.detail ? <span className="opacity-70">{entry.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
