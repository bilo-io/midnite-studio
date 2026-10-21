import { Easing, interpolate } from "remotion";

import { BG, LIGHT, RAINBOW, type Theme } from "../../../../shared/brand";
import { wipeCoverage } from "../../../../shared/LiquidWipe";
import { BUILD, CLAIM, HARNESS, STAGE } from "./beats";

/**
 * Every change of stage in the film, in one list.
 *
 * `Backdrop` draws these and `Promo` reads them, which is the whole reason they
 * are not simply written out inside `Backdrop`. Anything standing *on* the
 * surface and painted in the surface's own colours has to change colour as the
 * wipe passes under it — in this film that is the lockup, which is on screen
 * through every one of them — and the frame it changes on depends on the wipe's
 * length, its easing, its direction and where the object happens to be standing.
 *
 * Those four facts live here. `themeMixAt` below reads them and hands back a
 * blend, so there is no second copy of the schedule to fall out of step with the
 * first. An earlier cut had one: hand-timed interpolations in `Promo`, derived
 * by inverting the easing on paper. Two of the four were wrong in the first
 * render — a white crescent on white paper for a quarter of a second, and an ink
 * one on near-black for six tenths — and neither shows up in a thumbnail.
 *
 * ── The order of surfaces ───────────────────────────────────────────────────
 *
 * | bar | stage | what is standing on it |
 * |---|---|---|
 * | — | black | the intro: a terminal and a logo, and the frame the film ends on |
 * | 0 | light | the lockup, the agent roster, the repo sidebar |
 * | 4 | dark | the git graph, the kanban card, the forge, the browser |
 * | 8 | light | the knowledge graph and the kanban — the music's own section change |
 * | 10 | dark | "Replace no one" |
 * | 11 | light | "Empower everyone!", the four features, the strip-back |
 * | 18 | dark | the drop: embedded skills, convenient loops |
 * | 25 | light | custom graphs |
 * | 28 | dark | the companion, and the whole outro |
 *
 * The first cut changed stage three times, all of them at act boundaries, and
 * the brief asked for the transition to be used more — so stages 2 and 4 now
 * turn over inside themselves as well. Where each flip lands is not free
 * choice: every one is a bar line with a measured onset under it, and bar 8 is
 * the track's own section change.
 *
 * Two places deliberately do **not** flip. The loops movement stays dark
 * because its six flashes are Tailwind 500s and cyan-500 on 99%-lightness paper
 * is 2.6:1 — the colour *is* the point of that beat and the light stage takes
 * it away. And the outro stays dark from bar 28, because the last thing this
 * film does is land on black.
 *
 * ── Directions alternate, and both themes are entered both ways ─────────────
 *
 * Right, left, right, left, all the way down. Wipes all travelling the same way
 * read as one object crossing the film again and again; alternating reads as
 * the stage being dealt. It also means each theme is arrived at from both sides
 * over the course of the film, which the brief asked for in as many words.
 */
export type Wipe = {
  /** Unique — `LiquidWipe` ids are document-global. */
  id: string;
  /** The frame the wipe starts on. */
  at: number;
  /** How long it takes, in frames. */
  length: number;
  direction: 1 | -1;
  /** The surface it brings in. */
  background: string;
  /** The light riding its leading edge. */
  accent: string;
  seed: number;
  /** The theme the film is on once it has landed. */
  theme: Theme;
};

/**
 * How long each wipe runs.
 *
 * The first is a little under a bar — long enough to be watched, which is what
 * the brief wanted from "liquid / smoke". The rest are half that, for two
 * different reasons: the pair in the build-up are a bar apart and a 46-frame
 * dissolve would still be crossing when the next one started, and the one on
 * the drop lands on the biggest hit in the track, where a long dissolve would
 * be the picture arriving a bar late. A drop is a cut.
 */
const LONG = 46;
const SHORT = 26;

/** A wipe to the dark stage. Direction and seed are the caller's. */
const toDark = (id: string, at: number, direction: 1 | -1, seed: number, accent: string): Wipe => ({
  id,
  at,
  length: SHORT,
  direction,
  background: BG.base,
  accent,
  seed,
  theme: "dark",
});

/** A wipe to the light stage. */
const toLight = (id: string, at: number, direction: 1 | -1, seed: number, accent: string): Wipe => ({
  id,
  at,
  length: SHORT,
  direction,
  background: LIGHT.BG.base,
  accent,
  seed,
  theme: "light",
});

export const WIPES: readonly Wipe[] = [
  /* The first hit. The only long one — it is the film's first change of stage. */
  {
    id: "wipe-product",
    at: STAGE.product,
    length: LONG,
    direction: 1,
    background: LIGHT.BG.base,
    accent: LIGHT.RAINBOW[3],
    seed: 3,
    theme: "light",
  },
  toDark("wipe-swarm", CLAIM.swarm, -1, 7, RAINBOW[4]),
  toLight("wipe-graph", CLAIM.graph, 1, 13, LIGHT.RAINBOW[1]),
  toDark("wipe-replace", BUILD.replaceNoOne, -1, 11, RAINBOW[4]),
  toLight("wipe-empower", BUILD.empower, 1, 17, LIGHT.RAINBOW[1]),
  /*
    Multi-window is on the dark stage and everything either side of it is on the
    light one (v7). Its windows stay the light takes: four white windows on a
    dark stage is what makes them read as separate objects, where on white
    paper the gaps between them were white on white.
  */
  toDark("wipe-multiwindow", BUILD.items[0], -1, 37, RAINBOW[3]),
  toLight("wipe-councils", BUILD.items[1], 1, 41, LIGHT.RAINBOW[2]),
  toDark("wipe-harness", STAGE.harness, -1, 23, RAINBOW[0]),
  toLight("wipe-graphs", HARNESS.graphs.heading, 1, 29, LIGHT.RAINBOW[3]),
  toDark("wipe-companion", HARNESS.companion.heading, -1, 31, RAINBOW[2]),
];

/** Eased so the panel arrives fast and settles, rather than sliding linearly. */
const ease = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.22, 0.6, 0.2, 1),
} as const;

/** How far through a wipe the film is on this frame. */
export const wipeProgress = (frame: number, wipe: Wipe): number =>
  interpolate(frame, [wipe.at, wipe.at + wipe.length], [0, 1], ease);

/**
 * Which stage the film is standing on at `frame` — the last wipe to have
 * started, or `dark` before any of them.
 *
 * Discrete, where `themeMixAt` is continuous, and the two are for different
 * jobs. A colour that has to stay legible *through* a wipe reads the blend; a
 * component that has to pick a whole set of tokens — which cut of the logo,
 * which ramp, how bright a card's bloom — reads this, because half a theme is
 * not a theme.
 *
 * It answers for the frame a scene *starts* on, which is the frame the wipe
 * starts on too. That is deliberate: by the time anything in the scene is
 * legible the wipe has passed, and the few frames in between are exactly what
 * `themeMixAt` is for.
 */
export const themeAt = (frame: number): Theme => {
  let theme: Theme = "dark";
  for (const wipe of WIPES) if (frame >= wipe.at) theme = wipe.theme;
  return theme;
};

/**
 * Which theme is under a given column of the frame: 0 dark, 1 light, and the
 * fraction between them while a wipe's smoke is crossing that column.
 *
 * Applied in order, each blend on top of the last, so the value is "whatever
 * the most recent wipe to have reached this x has made it" without any of them
 * needing to know what came before. The stack of wipes in `Backdrop` is drawn
 * the same way and for the same reason.
 *
 * `x` is a stage coordinate — 0 at the left edge, 1920 at the right. Pass where
 * the object actually is on this frame, not where it started: an object that
 * moves during a wipe is covered at a different time than one that does not,
 * which is exactly the case the hand-timed version kept getting wrong.
 */
export const themeMixAt = (frame: number, x: number): number => {
  let mix = 0; /* the intro is black, which is the dark theme's business */
  for (const wipe of WIPES) {
    const cover = wipeCoverage(wipeProgress(frame, wipe), x, wipe.direction);
    const target = wipe.theme === "light" ? 1 : 0;
    mix += (target - mix) * cover;
  }
  return mix;
};
