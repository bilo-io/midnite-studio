import { Easing, interpolate } from "remotion";

import { BG, LIGHT, RAINBOW, type Theme } from "../../../shared/brand";
import { wipeCoverage } from "../../../shared/LiquidWipe";
import { T } from "./beats";

/**
 * Every change of stage, in one list — the promo's `wipes.ts` pattern.
 *
 * The backdrop draws these, and anything standing *on* the stage reads them to
 * pick its colours: `themeAt` for a whole set of tokens (which logo cut, which
 * ramp), `themeMixAt` for a colour that must stay legible *while* a wipe's smoke
 * crosses under it. One schedule, read by both, so type can never be ink on a
 * page that has already gone black.
 *
 * The rules the promo settled on, all shown here:
 *
 *   - **The first change is long** (`LONG`, just under a bar) because it is the
 *     film's first change of stage and is meant to be watched. The rest are
 *     `SHORT`: half a bar, so two a bar apart never overlap.
 *   - **The drop is a wipe too, and short**, because a drop is a cut: a long
 *     dissolve there is the picture arriving late.
 *   - **Directions alternate** (1, -1, 1, …) so the stage reads as being dealt,
 *     and each theme is entered from both sides.
 *   - **Each wipe has its own `id` and `seed`.** SVG filter ids are
 *     document-global; two wipes sharing an id silently share one filter.
 *   - **The accent is a ramp stop** of the theme being *arrived at*.
 */
export type Wipe = {
  id: string;
  at: number;
  length: number;
  direction: 1 | -1;
  background: string;
  accent: string;
  seed: number;
  theme: Theme;
};

const LONG = 46;
const SHORT = 26;

const to = (theme: Theme, id: string, at: number, direction: 1 | -1, seed: number, length = SHORT): Wipe => ({
  id,
  at,
  length,
  direction,
  background: theme === "light" ? LIGHT.BG.base : BG.base,
  accent: theme === "light" ? LIGHT.RAINBOW[seed % LIGHT.RAINBOW.length] : RAINBOW[seed % RAINBOW.length],
  seed,
  theme,
});

export const WIPES: readonly Wipe[] = [
  to("light", "tpl-wipe-first-hit", T.claims[0], 1, 3, LONG),
  to("dark", "tpl-wipe-claim-dark", T.claims[2], -1, 7),
  to("light", "tpl-wipe-claim-light", T.claims[3], 1, 13),
  to("dark", "tpl-wipe-statement-dark", T.statement[0], -1, 11),
  to("light", "tpl-wipe-statement-light", T.statement[1], 1, 17),
  to("dark", "tpl-wipe-drop", T.drop, -1, 23),
  to("light", "tpl-wipe-late", T.late, 1, 29),
  to("dark", "tpl-wipe-outro", T.connect, -1, 31),
];

const ease = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.22, 0.6, 0.2, 1),
} as const;

export const wipeProgress = (frame: number, wipe: Wipe): number =>
  interpolate(frame, [wipe.at, wipe.at + wipe.length], [0, 1], ease);

/** The stage at `frame`: the last wipe to have started, else dark. */
export const themeAt = (frame: number): Theme => {
  let theme: Theme = "dark";
  for (const wipe of WIPES) if (frame >= wipe.at) theme = wipe.theme;
  return theme;
};

/** 0 dark … 1 light, under column `x` of the stage, blended through each wipe. */
export const themeMixAt = (frame: number, x: number): number => {
  let mix = 0;
  for (const wipe of WIPES) {
    const cover = wipeCoverage(wipeProgress(frame, wipe), x, wipe.direction);
    mix += ((wipe.theme === "light" ? 1 : 0) - mix) * cover;
  }
  return mix;
};

/** The wipe crossing the stage at `frame`, if any — for the annotation overlay. */
export const wipeAt = (frame: number): Wipe | null =>
  WIPES.find((w) => frame >= w.at && frame < w.at + w.length) ?? null;
