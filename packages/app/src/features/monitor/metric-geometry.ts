/**
 * Chart geometry, as data.
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
