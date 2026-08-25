import type { PaletteStyle } from './graph-themes';

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
const LANE_HUES: readonly [number, number, number][] = [
  [210, 90, 58], // blue
  [160, 70, 45], // teal
  [280, 70, 65], // violet
  [35, 90, 55], // amber
  [340, 75, 62], // rose
  [190, 80, 48], // cyan
  [100, 55, 48], // green
  [20, 85, 58], // orange
  [255, 75, 68], // indigo
  [320, 60, 58], // magenta
];

/**
 * `muted` is derived, not a second hand-tuned array.
 *
 * The HUE is preserved and only saturation is pulled back, so a branch is
 * recognisably the same colour whichever style you are in — switching style
 * should change the drawing, not re-identify the branches. Two independent
 * arrays would also be two things to keep in step every time the palette moves.
 */
const MUTED_SATURATION = 0.5;
const MUTED_LIGHTNESS_SHIFT = -4;

export const laneColor = (colorIdx: number, palette: PaletteStyle = 'vivid'): string => {
  const [h, s, l] = LANE_HUES[colorIdx % LANE_HUES.length] ?? LANE_HUES[0]!;
  return palette === 'muted'
    ? `hsl(${h} ${Math.round(s * MUTED_SATURATION)}% ${l + MUTED_LIGHTNESS_SHIFT}%)`
    : `hsl(${h} ${s}% ${l}%)`;
};

/** Distinct lane colours available before the palette repeats. */
export const LANE_COLOR_COUNT = LANE_HUES.length;

/** Every colour in a palette — for the `<defs>` block that defines one marker per colour. */
export const laneColors = (palette: PaletteStyle): string[] =>
  LANE_HUES.map((_, index) => laneColor(index, palette));
