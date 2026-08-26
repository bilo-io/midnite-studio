import type { MetricId } from '@midnite/git-shared';

import type { MetricPoint } from '../../store/metrics-store';
import { SPARKLINE_GEOMETRY } from './metric-geometry';
import { metricColor, metricFill } from './metric-palette';
import { areaPath, linePath } from './metric-path';

/**
 * The inline form: ~28×12, no axis, no legend, no cadence rules.
 *
 * Same path maths as the flyout's chart — it takes a different geometry and
 * nothing else — so the two can never drift into drawing the same data
 * differently.
 *
 * **`aria-hidden`.** The percentage rendered beside it is the accessible value,
 * and a screen reader announcing "graphic" for a 28-pixel decoration next to
 * the number it decorates is noise, not information.
 */
export function Sparkline({
  id,
  points,
}: {
  id: MetricId;
  points: readonly MetricPoint[];
}) {
  // One point cannot describe a trend, and the store's flat seed means a real
  // series always has at least two — so this only fires before the first
  // sample lands.
  if (points.length < 2) return null;

  const geometry = SPARKLINE_GEOMETRY;
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      width={geometry.width}
      height={geometry.height}
      className="shrink-0"
    >
      <path d={areaPath(points, geometry)} fill={metricFill(id, geometry.areaAlpha)} />
      <path
        d={linePath(points, geometry)}
        fill="none"
        stroke={metricColor(id)}
        strokeWidth={geometry.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
