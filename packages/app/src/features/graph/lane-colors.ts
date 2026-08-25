/**
 * Lane palette.
 *
 * The engine hands over a `colorIdx` (a hash of the sha that opened the lane);
 * this is where it becomes a colour. Raw HSL triples rather than token names
 * because these are *data* colours with no semantic role in the design system —
 * there is no `--lane-4` token, and reusing `--primary`/`--destructive` for
 * branch lanes would tie an arbitrary branch to "danger".
 *
 * Hues are spread evenly and kept at a saturation/lightness that stays legible
 * on both the light and dark backgrounds, so one palette serves both themes.
 */
export const LANE_COLORS: readonly string[] = [
  'hsl(210 90% 58%)', // blue
  'hsl(160 70% 45%)', // teal
  'hsl(280 70% 65%)', // violet
  'hsl(35 90% 55%)', // amber
  'hsl(340 75% 62%)', // rose
  'hsl(190 80% 48%)', // cyan
  'hsl(100 55% 48%)', // green
  'hsl(20 85% 58%)', // orange
  'hsl(255 75% 68%)', // indigo
  'hsl(320 60% 58%)', // magenta
];

export const laneColor = (colorIdx: number): string =>
  LANE_COLORS[colorIdx % LANE_COLORS.length] ?? LANE_COLORS[0]!;
