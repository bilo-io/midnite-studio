import { createContext, createElement, useContext } from "react";
import { Easing, interpolate } from "remotion";

import { BG, LIGHT, RAINBOW, type Theme } from "../brand";
import { wipeCoverage } from "../LiquidWipe";

/**
 * The golive kit's two stages, as a schedule of wipes — the go-live promo's
 * `wipes.ts` pattern, made reusable.
 *
 * A video lists every change of stage once (`wipeTo(...)`), builds a `Stage`
 * from the list, draws the wipes with `StageWipes` (see `parts.tsx`), and
 * mounts `StageProvider` around everything standing on the stage. The parts
 * in this folder read the stage from context to pick their colours:
 * `themeAt` for a whole set of tokens (which logo cut, which ramp),
 * `themeMixAt` for a colour that must stay legible *while* a wipe's smoke
 * crosses under it. One schedule, read by both, so type can never be ink on a
 * page that has already gone black.
 *
 * The rules the promo settled on:
 *
 *   - **The first change is long** (`LONG_WIPE`, just under a bar at 141 BPM)
 *     because it is meant to be watched. The rest are `SHORT_WIPE`, so two a
 *     bar apart never overlap.
 *   - **A drop is a wipe too, and short**: a long dissolve there is the picture
 *     arriving late.
 *   - **Directions alternate** (1, -1, 1, …), so each theme is entered from
 *     both sides.
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

export const LONG_WIPE = 46;
export const SHORT_WIPE = 26;

/** A wipe that turns the stage to `theme` from frame `at`. */
export const wipeTo = (
  theme: Theme,
  id: string,
  at: number,
  direction: 1 | -1,
  seed: number,
  length = SHORT_WIPE,
): Wipe => ({
  id,
  at,
  length,
  direction,
  background: theme === "light" ? LIGHT.BG.base : BG.base,
  accent: theme === "light" ? LIGHT.RAINBOW[seed % LIGHT.RAINBOW.length] : RAINBOW[seed % RAINBOW.length],
  seed,
  theme,
});

const ease = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.22, 0.6, 0.2, 1),
} as const;

export type Stage = {
  wipes: readonly Wipe[];
  /** 0…1 of `wipe` at `frame`. */
  wipeProgress: (frame: number, wipe: Wipe) => number;
  /** The stage at `frame`: the last wipe to have started, else dark. */
  themeAt: (frame: number) => Theme;
  /** 0 dark … 1 light, under column `x` of the stage, blended through each wipe. */
  themeMixAt: (frame: number, x: number) => number;
  /** The wipe crossing the stage at `frame`, if any — for annotation overlays. */
  wipeAt: (frame: number) => Wipe | null;
};

export const createStage = (wipes: readonly Wipe[]): Stage => {
  const wipeProgress = (frame: number, wipe: Wipe): number =>
    interpolate(frame, [wipe.at, wipe.at + wipe.length], [0, 1], ease);
  return {
    wipes,
    wipeProgress,
    themeAt: (frame) => {
      let theme: Theme = "dark";
      for (const wipe of wipes) if (frame >= wipe.at) theme = wipe.theme;
      return theme;
    },
    themeMixAt: (frame, x) => {
      let mix = 0;
      for (const wipe of wipes) {
        const cover = wipeCoverage(wipeProgress(frame, wipe), x, wipe.direction);
        mix += ((wipe.theme === "light" ? 1 : 0) - mix) * cover;
      }
      return mix;
    },
    wipeAt: (frame) => wipes.find((w) => frame >= w.at && frame < w.at + w.length) ?? null,
  };
};

/** A stage that never changes: dark throughout. The context's default. */
const DARK_ONLY = createStage([]);

const StageContext = createContext<Stage>(DARK_ONLY);

export const useStage = (): Stage => useContext(StageContext);

export const StageProvider: React.FC<{ stage: Stage; children: React.ReactNode }> = ({ stage, children }) =>
  createElement(StageContext.Provider, { value: stage }, children);
