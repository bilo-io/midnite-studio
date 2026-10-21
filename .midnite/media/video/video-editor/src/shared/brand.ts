/**
 * midnite's brand tokens, transcribed from the product's own source of truth
 * (`midnite-studio/packages/website/src/styles/tokens.css`) so a video and the
 * app cannot drift into two different purples.
 *
 * **Both themes are here, and the dark one is the default.** A video is not a
 * UI the viewer can toggle, so for most of a cut there is one fixed surface and
 * midnite's is the near-black page — every unqualified token below is that
 * page. What made the light half necessary is a film that *changes* surface: the
 * golive-promo wipes from black to white and back again as it moves between
 * acts, and a wipe is only worth doing if what lands on the other side is the
 * product's real light theme rather than the dark theme with its background
 * inverted.
 *
 * The two halves are not each other's negatives and must not be derived from
 * one another. `LIGHT.RAINBOW` in particular is a *separate, dimmed* re-cut of
 * the ramp from `tokens.css`: the dark stops are chosen to clear 4.5:1 against
 * near-black and are far too light to put on white — the site drops each one
 * only as far as it has to, and pink is the floor at 5.4:1. Painting the dark
 * ramp on the white stage is the single most likely way to get this wrong and
 * it does not look wrong in a thumbnail, only in a still.
 *
 * Hex rather than `hsl(…)` strings because Remotion interpolates colours by
 * channel (`interpolateColors`), and a hex literal is the form every one of
 * its helpers accepts without parsing.
 */

/** The page itself: three depths of near-black. */
export const BG = {
  /** The default video background. */
  base: "#0d0d14",
  /** A card or panel lifted off the page. */
  elevated: "#16161f",
  /** Behind the page — the ink that sits *on* a rainbow fill. */
  sunken: "#08080d",
} as const;

/** Type on that page, in three strengths. */
export const FG = {
  base: "#f4f4f7",
  muted: "#b4b4bf",
  subtle: "#82828f",
} as const;

export const BORDER = {
  base: "#292933",
  strong: "#41414f",
} as const;

/**
 * The six-stop rainbow, blue → pink, in paint order.
 *
 * The ramp closes its own loop wherever it is used as a repeating gradient —
 * see `rainbowGradient` below, which repeats stop 0 at the end so a drifting
 * tile meets itself seamlessly rather than jumping from pink back to blue.
 */
export const RAINBOW = [
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
] as const;

/**
 * The ramp as a CSS gradient, closed into a loop.
 *
 * `angle` is degrees, matching CSS's convention (0 = up, 100 = the site's own
 * near-horizontal tilt on `.ws-rainbow-text`).
 */
export const rainbowGradient = (angle = 100): string =>
  `linear-gradient(${angle}deg, ${[...RAINBOW, RAINBOW[0]].join(", ")})`;

/**
 * Styles that clip a gradient to the glyphs of a text node — the site's
 * `.ws-rainbow-text`, as an inline style object.
 *
 * Spread onto the element that holds the *text*, not a wrapper: the clip
 * applies to the box's own glyphs, so an intermediate element paints the ramp
 * on an empty box and the text stays transparent.
 */
export const rainbowText = (angle = 100) =>
  ({
    backgroundImage: rainbowGradient(angle),
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
  }) as const;

/**
 * The light surface, for a cut that changes stage rather than sits on one.
 *
 * Transcribed from the same file as everything above — the
 * `:root[data-theme='light']` block of midnite-studio's
 * `packages/website/src/styles/tokens.css` — and converted from its HSL
 * triplets to hex here for the same reason the dark tokens are hex: Remotion
 * interpolates colours by channel, and a hex literal is the form every one of
 * its helpers takes without parsing. A wipe between the two themes is an
 * `interpolateColors` across these pairs, so they have to be the same shape.
 *
 * Note what is *not* simply lighter: `FG.base` on the dark stage is a near-white
 * at 96% lightness and its light-theme counterpart is 12%, but `fg.muted` moves
 * from 72% to 36% rather than to 28% — the light theme leans on its type being
 * darker than the rule of thumb, because 99%-lightness paper is far brighter
 * than a 6%-lightness page is dark. Reading a muted caption off the wrong one of
 * these is how a light section ends up looking washed out.
 */
export const LIGHT = {
  BG: {
    base: "#fcfcfd",
    elevated: "#f2f2f7",
    sunken: "#e9e9f1",
  },
  FG: {
    base: "#171726",
    muted: "#535365",
    subtle: "#75758a",
  },
  BORDER: {
    base: "#d9d9e2",
    strong: "#b9b9ca",
  },
  /** The violet, darkened — the dark theme's fails contrast on white. */
  ACCENT: "#6e2fc6",
  /**
   * The same six hues, each dropped only as far as it had to be to clear 4.5:1
   * on `LIGHT.BG.base`. Every stop clears it, so gradient text on the light
   * stage needs no backplate — which is what lets the wordmark keep its ramp
   * across the wipe instead of turning solid for the light act.
   */
  RAINBOW: [
    "#175dcf", // blue    — 5.8:1
    "#393cc6", // indigo  — 7.8:1
    "#5c2fc6", // violet  — 7.7:1
    "#7829c2", // purple  — 7.1:1
    "#9a2bab", // fuchsia — 6.2:1
    "#c12573", // pink    — 5.4:1
  ],
} as const;

/** The two stages a midnite video can sit on. */
export type Theme = "dark" | "light";

/**
 * Every token for one theme, so a component that has to work on both takes a
 * `Theme` and reads one object rather than branching at each colour.
 *
 * The dark side is assembled from the module's own exports rather than
 * duplicated, so there is exactly one place a dark value is written.
 */
export const THEME = {
  dark: { BG, FG, BORDER, ACCENT: RAINBOW[2], RAINBOW },
  light: LIGHT,
} as const;

/**
 * The ramp's stops for a stage, as a CSS stop list with the loop closed.
 *
 * Just the colours, so a caller can put them in whichever gradient function it
 * needs — `linear-gradient` for type and a rule, `conic-gradient` for a glow
 * behind a round mark. The loop matters in both: stop 0 is repeated at the end
 * so a sweep meets itself rather than jumping from pink back to blue, which on
 * a conic gradient is a visible seam rather than a subtle one.
 */
export const themeRainbowStops = (theme: Theme): string => {
  const ramp = THEME[theme].RAINBOW;
  return [...ramp, ramp[0]].join(", ");
};

/**
 * The ramp as a CSS gradient on a given stage.
 *
 * `rainbowGradient` above is the dark one and stays that way — it is what every
 * existing composition calls, and changing its meaning to "whichever theme is
 * current" would silently repaint the pilot.
 */
export const themeRainbowGradient = (theme: Theme, angle = 100): string =>
  `linear-gradient(${angle}deg, ${themeRainbowStops(theme)})`;

/** `rainbowText`, on a given stage. */
export const themeRainbowText = (theme: Theme, angle = 100) =>
  ({
    backgroundImage: themeRainbowGradient(theme, angle),
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
  }) as const;
