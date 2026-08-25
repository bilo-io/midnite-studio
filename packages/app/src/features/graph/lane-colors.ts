import type { CSSProperties } from 'react';

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

/**
 * The lane's hue, saturation and lightness, before they become a colour string.
 *
 * Exposed separately because the ref chips need the three components, not the
 * finished `hsl()`: a chip is a tint, a border and a label at three different
 * alphas and — in light theme — at a different lightness from the lane itself,
 * and `hsl(210 90% 58%)` cannot be taken apart again in CSS.
 */
export const laneHsl = (
  colorIdx: number,
  palette: PaletteStyle = 'vivid',
): [number, number, number] => {
  const [h, s, l] = LANE_HUES[colorIdx % LANE_HUES.length] ?? LANE_HUES[0]!;
  return palette === 'muted'
    ? [h, Math.round(s * MUTED_SATURATION), l + MUTED_LIGHTNESS_SHIFT]
    : [h, s, l];
};

export const laneColor = (colorIdx: number, palette: PaletteStyle = 'vivid'): string => {
  const [h, s, l] = laneHsl(colorIdx, palette);
  return `hsl(${h} ${s}% ${l}%)`;
};

/** Distinct lane colours available before the palette repeats. */
export const LANE_COLOR_COUNT = LANE_HUES.length;

/** Every colour in a palette — for the `<defs>` block that defines one marker per colour. */
export const laneColors = (palette: PaletteStyle): string[] =>
  LANE_HUES.map((_, index) => laneColor(index, palette));

/**
 * Lightness above which a lane is too pale to carry white text.
 *
 * The palette spans 45%–68%, which straddles the point where white stops
 * reading: white on the 45% green is fine, white on the 65% violet is not. The
 * checked-out ref chip is the one place a lane colour becomes a solid FILL
 * rather than a line, so it is the only place this matters.
 */
const INK_FLIP_LIGHTNESS = 58;

/** Text colour that reads on a chip filled solid with the lane's own colour. */
export const laneInk = (colorIdx: number, palette: PaletteStyle = 'vivid'): string => {
  const [h, , l] = laneHsl(colorIdx, palette);
  // Tinted rather than pure black: a neutral ink on a saturated fill reads as a
  // hole punched in the chip, where a dark shade of the hue reads as engraved.
  return l >= INK_FLIP_LIGHTNESS ? `hsl(${h} 70% 12%)` : 'hsl(0 0% 100%)';
};

/**
 * A lane's colour as three CSS custom properties, for an element that has to
 * build variants of it in the stylesheet rather than in JS.
 *
 * The ref chips do exactly that: `hsl(var(--lane-h) var(--lane-s) var(--lane-l)
 * / 0.16)` for the tint, the same triple at full alpha for the border, and a
 * theme-dependent lightness (`--lane-ink-l`, set in styles.css) for the label —
 * the palette is tuned to sit on a dark ground, so a chip on a light one needs a
 * darker ink than the lane it belongs to. None of that is expressible once the
 * colour has been assembled into a single string.
 */
export const laneVars = (
  colorIdx: number,
  palette: PaletteStyle = 'vivid',
): CSSProperties => {
  const [h, s, l] = laneHsl(colorIdx, palette);
  return {
    '--lane-h': `${h}`,
    '--lane-s': `${s}%`,
    '--lane-l': `${l}%`,
  } as CSSProperties;
};
