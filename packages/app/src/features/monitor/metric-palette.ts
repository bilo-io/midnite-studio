import type { MetricId } from '@midnite/studio-shared';

/**
 * Metric colours.
 *
 * Raw HSL triples rather than token names, for exactly the reason
 * `lane-colors.ts` gives about branch lanes: these are **data** colours with no
 * semantic role in the design system. There is no `--metric-gpu` token, and
 * borrowing `--destructive` for a GPU line would tell the reader that a busy
 * GPU is a problem. (The diagnostics counts arriving in Theme F are the
 * opposite case — an error count genuinely *is* semantic, and takes tokens.)
 *
 * One palette serves both themes: the hues are held at a saturation and
 * lightness that stay legible on the light and the dark ground, so switching
 * theme does not re-identify which line is which.
 *
 * The muted and fill variants are **derived**, not a second hand-tuned table.
 * Two independent arrays are two things to keep in step every time a hue moves,
 * and the derivation is what guarantees a metric is recognisably the same
 * colour in its dot, its sparkline and its chart fill.
 */

type Hsl = readonly [number, number, number];

const METRIC_HUES: Record<MetricId, Hsl> = {
  // Spread far enough apart to survive being 2px wide in a sparkline, where
  // adjacent hues become one smear.
  cpu: [210, 90, 58], // blue
  memory: [280, 70, 65], // violet
  gpu: [160, 70, 45], // teal
  disk: [35, 90, 55], // amber
};

export const metricHsl = (id: MetricId): Hsl => METRIC_HUES[id];

/** The line, the dot and the legend swatch. */
export const metricColor = (id: MetricId): string => {
  const [h, s, l] = metricHsl(id);
  return `hsl(${h} ${s}% ${l}%)`;
};

/**
 * The area under the line.
 *
 * Alpha rather than a lighter lightness: the charts stack three series in one
 * box, and only transparency lets an overlap read as an overlap instead of as
 * whichever series happened to paint last.
 */
export const metricFill = (id: MetricId, alpha: number): string => {
  const [h, s, l] = metricHsl(id);
  return `hsl(${h} ${s}% ${l}% / ${alpha})`;
};

/**
 * The glow behind a footer dot.
 *
 * Same hue, pulled to a low alpha — a `0 0 8px` shadow that reads as the dot
 * being lit rather than outlined.
 */
export const metricGlow = (id: MetricId): string => `0 0 8px ${metricFill(id, 0.6)}`;

/** Hue preserved, saturation pulled back — the `lane-colors.ts` muted rule. */
const MUTED_SATURATION = 0.5;

/** For a series that is present but not the one being read. */
export const metricMuted = (id: MetricId): string => {
  const [h, s, l] = metricHsl(id);
  return `hsl(${h} ${Math.round(s * MUTED_SATURATION)}% ${l}%)`;
};

/** Short labels for the legend and the accessible names. */
export const METRIC_LABELS: Record<MetricId, string> = {
  cpu: 'CPU',
  memory: 'RAM',
  gpu: 'GPU',
  disk: 'Disk',
};
