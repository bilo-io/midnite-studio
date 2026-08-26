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
 *
 * **Lightness varies deliberately, and that is the accessibility story.** The
 * palette this replaced held every lane inside a 0.63–0.77 band of perceptual
 * lightness, which looks tidy and is exactly what makes it fail: the common
 * colour-vision deficiencies collapse the red–green axis, so once hue is gone
 * there is nothing left to tell two equally-light lanes apart. Under simulated
 * protanopia its violet and indigo sat 0.0097 apart in OKLab — the same colour,
 * for practical purposes, on a graph whose entire job is telling branches apart.
 * Spreading lightness is what buys the separation back; `lane-contrast.test.ts`
 * measures it and fails if a future edit gives it away.
 */
const LANE_HUES: readonly [number, number, number][] = [
  [205, 82, 47], // blue
  [144, 72, 45], // emerald
  [265, 70, 57], // violet
  [50, 82, 42], // gold
  [322, 82, 52], // pink
  [183, 82, 48], // cyan
  [98, 65, 57], // lime
  [3, 82, 45], // red
  [257, 76, 76], // lavender
  [334, 50, 49], // plum
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

/** An HSL triple as sRGB channels in 0–1. */
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number): number =>
    lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

/** WCAG relative luminance. */
const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio between two relative luminances. */
const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Text colour that reads on a chip filled solid with the lane's own colour.
 *
 * Measured rather than thresholded. This used to flip on the HSL lightness
 * component, which is not a measure of how light a colour LOOKS: at `l: 48%`
 * the cyan is the brightest thing in the palette and the violet at `l: 57%` is
 * among the darkest, because HSL spends the same number on a channel humans
 * weight seven times more heavily in green than in blue. The old rule handed
 * white ink to the cyan and dark ink to the violet — both backwards, and both
 * invisible only to whoever was not looking at that particular chip.
 *
 * Computing the actual contrast ratio against both candidate inks and taking
 * the winner removes the threshold entirely, so a future palette edit cannot
 * land on the wrong side of one.
 */
export const laneInk = (colorIdx: number, palette: PaletteStyle = 'vivid'): string => {
  const [h, s, l] = laneHsl(colorIdx, palette);
  const fill = relativeLuminance(hslToRgb(h, s, l));

  // Tinted rather than pure black: a neutral ink on a saturated fill reads as a
  // hole punched in the chip, where a dark shade of the hue reads as engraved.
  const dark = `hsl(${h} 70% 12%)`;
  const darkLuminance = relativeLuminance(hslToRgb(h, 70, 12));

  return contrastRatio(fill, darkLuminance) >= contrastRatio(fill, 1) ? dark : 'hsl(0 0% 100%)';
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
