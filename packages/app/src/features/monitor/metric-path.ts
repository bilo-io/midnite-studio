import type { MetricPoint } from '../../store/metrics-store';
import type { MetricGeometry } from './metric-geometry';

/**
 * The chart's path maths, as pure functions.
 *
 * Values are already 0–100 when they arrive, so there is **no y-scaling pass**:
 * the domain is fixed by the contract rather than derived from the data, which
 * is what stops a chart from silently rescaling itself every time the peak
 * moves and making two screenshots incomparable.
 *
 * Points are spaced **by index**, not by timestamp. The adaptive cadence means
 * a series holds 2s-apart and 5s-apart points together, and index spacing draws
 * them identically — a real distortion, accepted because a time-scaled axis is
 * meaningful work for a five-minute window nobody measures against. It is not
 * hidden, though: `cadenceBreaks` finds where the spacing changed so the chart
 * can mark it with a faint rule. The store keeps the timestamps precisely so
 * that mark is possible.
 */

/** Where a value lands vertically. Fixed 0–100 domain, y inverted for SVG. */
export function yFor(value: number, geometry: MetricGeometry): number {
  const clamped = Math.min(100, Math.max(0, value));
  const usable = geometry.height - geometry.padTop;
  return geometry.padTop + (1 - clamped / 100) * usable;
}

/** Where the nth of `count` points lands horizontally. */
export function xFor(index: number, count: number, geometry: MetricGeometry): number {
  if (count <= 1) return geometry.width;
  return (index / (count - 1)) * geometry.width;
}

/**
 * The line itself: `M x,y L x,y …`.
 *
 * Empty for an empty series — a metric this machine cannot report draws
 * nothing at all, rather than a flat line along the bottom.
 */
export function linePath(points: readonly MetricPoint[], geometry: MetricGeometry): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => {
      const x = round(xFor(index, points.length, geometry));
      const y = round(yFor(point.value, geometry));
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

/**
 * The filled area: the same line, closed down the right edge, along the bottom
 * and back up the left.
 *
 * Closed to `height` rather than to the axis of the lowest value, so the fill
 * always reads as "this much of the whole", which is what a 0–100 domain means.
 */
export function areaPath(points: readonly MetricPoint[], geometry: MetricGeometry): string {
  const line = linePath(points, geometry);
  if (line === '') return '';
  return `${line} L${round(geometry.width)},${round(geometry.height)} L0,${round(geometry.height)} Z`;
}

/**
 * Ratio at which two consecutive intervals count as a cadence change.
 *
 * The real jump is 2s ⇄ 5s (2.5×), so 1.5 catches it with room to spare while
 * ignoring the ordinary jitter of a timer that fired a few milliseconds late.
 */
const CADENCE_CHANGE_RATIO = 1.5;

/**
 * x positions where the sampling interval changed, for the flyout's faint
 * gridline.
 *
 * The mark is the honest half of spacing by index: the chart cannot show that
 * a gap was 5s rather than 2s, but it can show you *where* the compression
 * happened, so a flat-looking stretch is legible as "we were sampling slowly"
 * rather than "nothing happened".
 *
 * The **first** interval is never compared. The store seeds a new series with
 * two points one millisecond apart, and treating that against the first real
 * interval would put a spurious rule at the left edge of every fresh chart.
 */
export function cadenceBreaks(
  points: readonly MetricPoint[],
  geometry: MetricGeometry,
): number[] {
  if (points.length < 4) return [];

  const breaks: number[] = [];
  // From index 3, so the first comparison is between the second and third
  // intervals — the seed interval is never one of the two being compared.
  for (let index = 3; index < points.length; index += 1) {
    const previous = points[index - 1]!.at - points[index - 2]!.at;
    const current = points[index]!.at - points[index - 1]!.at;
    if (previous <= 0 || current <= 0) continue;

    const ratio = current > previous ? current / previous : previous / current;
    if (ratio < CADENCE_CHANGE_RATIO) continue;

    // Midway between the two points: the change happened in the gap, not at
    // either sample, and drawing it on a point would claim that reading was
    // special.
    const before = xFor(index - 1, points.length, geometry);
    const after = xFor(index, points.length, geometry);
    breaks.push(round((before + after) / 2));
  }
  return breaks;
}

/** Two decimals is well below a device pixel and keeps the `d` attribute short. */
const round = (value: number): number => Math.round(value * 100) / 100;
