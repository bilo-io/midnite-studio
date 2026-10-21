/**
 * The neon-HUD look, as numbers.
 *
 * Measured off the reference this kit was made from (DEEPTECH AI LABS' "FUGU
 * Proves Intelligence Isn't What You Think", 1080p60): near-black stage with a
 * cool radial lift in the middle, white headline type with a cyan halo, and
 * one accent colour per idea. The accents carry meaning rather than variety —
 * red is reserved for negation ("NOT", "NO", a struck-out card), green and
 * amber are the two sides of a comparison, cyan is everything else.
 */
import { loadFont as loadHeadFont } from "@remotion/google-fonts/Roboto";

import { monoFontFamily } from "../fonts";

export const { fontFamily: headFontFamily } = loadHeadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin", "latin-ext"],
});

/** Labels, readouts and anything the viewer would type. */
export const hudMonoFamily = monoFontFamily;

export const STAGE = {
  /** The page. Never pure black — the vignette needs somewhere to fall to. */
  base: "#03060b",
  /** The lift behind the centre of the frame. */
  lift: "#0a1b2e",
  /** Hairlines, dashed connectors, empty card fill. */
  line: "#1d4f73",
  ink: "#f2f8ff",
  /** Small mono labels: dim enough to sit behind the headline. */
  dim: "#7fa6c2",
} as const;

export const TONES = {
  cyan: "#22d3ee",
  blue: "#3b8cff",
  green: "#2ee07a",
  amber: "#ffb020",
  red: "#ff2e63",
} as const;

export type Tone = keyof typeof TONES;

/** A stacked halo — the "neon" is three shadows, not one. */
export const glow = (color: string, strength = 1): string =>
  [
    `0 0 ${4 * strength}px ${color}`,
    `0 0 ${14 * strength}px ${color}aa`,
    `0 0 ${36 * strength}px ${color}55`,
  ].join(", ");

/** The same halo for SVG strokes and boxes. */
export const boxGlow = (color: string, strength = 1): string =>
  `0 0 ${6 * strength}px ${color}cc, 0 0 ${22 * strength}px ${color}55, inset 0 0 ${14 * strength}px ${color}22`;
