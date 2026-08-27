import type { MetricId } from '@midnite/git-shared';

import { DONUT_GEOMETRY } from './metric-geometry';
import { metricColor, metricFill } from './metric-palette';
import { ringGeometry } from './metric-path';

/**
 * A level, as a ring: how much of a fixed capacity is in use.
 *
 * The footer's form for a metric that does not move — disk, today. A sparkline
 * of capacity is a flat line, which is a chart shape promising a trend that is
 * not there; a ring answers the only question capacity raises, which is how
 * much of it is left. See `DONUT_GEOMETRY` for why the flyout's bar and this
 * are the same argument at two sizes.
 *
 * **One `<circle>`, dashed, not an arc path** — see `ringGeometry`, which owns
 * the arithmetic and the reason. `rotate(-90)` is the only part left here: it
 * moves the ring's start from three o'clock to twelve, where a reader expects
 * a gauge to begin.
 *
 * **`aria-hidden`, like `Sparkline`.** The percentage rendered beside it is the
 * accessible value and the readout's own `aria-label` carries the whole fact;
 * a screen reader announcing "graphic" between the label and the number is
 * noise.
 */
export function MetricDonut({ id, percent }: { id: MetricId; percent: number }) {
  const { size, trackAlpha } = DONUT_GEOMETRY;
  const { centre, radius, stroke, circumference, dash } = ringGeometry(percent, DONUT_GEOMETRY);

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="shrink-0"
    >
      {/* The remainder, in the metric's own hue at the sparkline's area alpha —
          so the ring reads as a member of the same family as the lines beside
          it rather than as a neutral widget that borrowed a colour. */}
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={metricFill(id, trackAlpha)}
        strokeWidth={stroke}
      />
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={metricColor(id)}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
    </svg>
  );
}
