import type { MetricId } from '@midnite/git-shared';

/**
 * How each metric is drawn, and at what size — as data.
 *
 * The same move `graph-themes.ts` makes: a chart's dimensions, stroke weight
 * and fill alpha are a coherent set of decisions that have to move together,
 * and scattering them as literals through JSX makes "why is the sparkline's
 * line thinner?" a question you answer by reading two components instead of
 * one table.
 *
 * It also makes the two chart forms provably the same drawing at two sizes —
 * `metric-path.ts` takes a geometry and knows nothing else about which surface
 * it is drawing for.
 */

export type MetricGeometry = {
  width: number;
  height: number;
  strokeWidth: number;
  /** Alpha of the area under the line. */
  areaAlpha: number;
  /**
   * Inset from the top edge, in user units.
   *
   * Without it a 100% reading is drawn exactly on y=0 and the stroke is
   * half-clipped by the viewBox — the one value most worth seeing clearly is
   * the one that would render as a thin smear against the edge.
   */
  padTop: number;
};

/** The ~24×12 inline form beside each footer percentage. */
export const SPARKLINE_GEOMETRY: MetricGeometry = {
  width: 28,
  height: 12,
  // Thinner than the chart's: at 12px tall a 1.5px stroke is an eighth of the
  // whole drawing and the shape stops being readable.
  strokeWidth: 1,
  areaAlpha: 0.22,
  padTop: 1,
};

/** The stacked area charts in the flyout. */
export const CHART_GEOMETRY: MetricGeometry = {
  width: 260,
  height: 64,
  strokeWidth: 1.5,
  areaAlpha: 0.16,
  padTop: 2,
};

/**
 * The gauge disk gets instead of a fourth chart.
 *
 * A capacity line is flat for hours; drawn as a timeline it would imply
 * movement that is not there. A bar says the one thing capacity has to say.
 */
export const GAUGE_GEOMETRY = {
  height: 6,
  radius: 3,
} as const;

/**
 * The donut disk gets in the footer, instead of a fourth sparkline.
 *
 * The same argument the flyout's bar makes, at 12px: a sparkline of capacity
 * is a horizontal line that never moves, which is a chart shape promising a
 * trend it does not have. A ring shows a *proportion*, which is the only thing
 * a capacity reading has to say — and it says it in one glance rather than
 * asking the reader to compare a flat line against nothing.
 *
 * `thickness` is a fraction of the outer radius rather than a pixel width, so
 * the hole stays the same fraction of the mark at any size. The ring is stroked
 * on a circle inset by half of it, which is what puts its outer edge exactly on
 * the viewBox rather than half a stroke outside it — the small-mark version of
 * `padTop` above.
 */
export const DONUT_GEOMETRY = {
  size: 12,
  /** Ring thickness as a fraction of the outer radius; the hole is the rest. */
  thickness: 0.45,
  /** Alpha of the unused remainder, matching the sparkline's area fill. */
  trackAlpha: 0.22,
} as const;

/**
 * The metrics drawn as a timeline — the ones that actually move.
 *
 * One list, read by the footer cluster and the flyout, because "which metrics
 * get a chart" has to have a single answer. Two copies would let the footer
 * grow a sparkline for something the flyout had already decided was a level,
 * which is precisely the state this replaces.
 *
 * Everything in `METRIC_IDS` and not in here is a **level**: a proportion of a
 * fixed capacity, flat over the window a timeline covers. Today that is disk
 * alone, and both surfaces draw it as a proportion — a ring in the footer, a
 * bar in the flyout.
 */
export const TIMELINE_METRICS: readonly MetricId[] = ['cpu', 'memory', 'gpu'];

/** Whether this metric is a level rather than a rate — see above. */
export const isLevelMetric = (id: MetricId): boolean => !TIMELINE_METRICS.includes(id);
