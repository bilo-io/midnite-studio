import { createContext, createElement, useContext } from "react";

import { BG, BORDER, FG, LIGHT, RAINBOW } from "../brand";
import { monoFontFamily, uiFontFamily } from "../fonts";
import { STAGE, TONES, type Tone, headFontFamily } from "./palette";

/**
 * What the HUD kit paints with, as one object — so the same headline, pill and
 * diagrams can stand on the reference's neon stage, on midnite's near-black
 * page, or on midnite's white one.
 *
 * Every component in `neon-hud/` reads `useHudSkin()` instead of `STAGE` and
 * `TONES` directly. The default is `NEON`, the kit's original look, so a
 * composition that never mounts a `HudSkinProvider` draws exactly what it drew
 * before (the neon-HUD template, and midnite video 1 up to v3).
 *
 * `brandSkin(mix)` is the midnite skin: 0 is the dark stage, 1 the light one,
 * and anything between is a channel-wise blend of the two. It takes a number
 * rather than a `Theme` because a scene that lands on a wipe has to follow the
 * smoke across the frame — pass it `themeMixAt(frame, x)` from the golive
 * stage, the same value the golive parts use for their type.
 *
 * Tones keep their *meaning* across skins (red is negation, green and amber the
 * two sides of a comparison, cyan everything else), not their hue: on the
 * brand skins "cyan" is the brand violet. Every light-stage tone clears 4.5:1 on
 * `LIGHT.BG.base`, like `LIGHT.RAINBOW` does.
 */
export type HudSkin = {
  /** Headline line A, readouts, terminal commands. */
  ink: string;
  /** Small mono labels that sit behind the headline. */
  dim: string;
  /** A bare `HudLabel`'s colour when the caller names none. */
  label: string;
  /** Hairlines, dashed connectors, axes. */
  line: string;
  /** Fill behind a pill, a node or a terminal. Six-digit hex; callers add alpha. */
  panel: string;
  /** The halo behind white type. */
  halo: string;
  tones: Record<Tone, string>;
  /** Multiplies every glow. 1 is the neon look; the light stage wants very little. */
  glow: number;
  headFont: string;
  headWeight: number;
  monoFont: string;
  /** The backdrop's lift, motes and vignette. */
  lift: string;
  mote: string;
  vignette: string;
  vignetteAlpha: number;
  /** A CSS background for the chapter card's rule — a colour, or the brand ramp. */
  rule: string;
};

export const NEON: HudSkin = {
  ink: STAGE.ink,
  dim: STAGE.dim,
  label: "#9fd8ff",
  line: STAGE.line,
  panel: "#030a12",
  halo: "#3fc8ff",
  tones: TONES,
  glow: 1,
  headFont: headFontFamily,
  headWeight: 900,
  monoFont: monoFontFamily,
  lift: STAGE.lift,
  mote: "#6fd6ff",
  vignette: "#000000",
  vignetteAlpha: 0.85,
  rule: TONES.cyan,
};

export const BRAND_DARK: HudSkin = {
  ink: FG.base,
  dim: FG.muted,
  label: FG.muted,
  line: BORDER.strong,
  panel: BG.elevated,
  halo: RAINBOW[2],
  tones: { cyan: "#a78bfa", blue: RAINBOW[0], green: "#22c55e", amber: "#f59e0b", red: "#f43f5e" },
  glow: 0.55,
  headFont: uiFontFamily,
  headWeight: 800,
  monoFont: monoFontFamily,
  lift: "#1d1736",
  mote: RAINBOW[3],
  vignette: "#000000",
  vignetteAlpha: 0.6,
  rule: `linear-gradient(90deg, ${[...RAINBOW].join(", ")})`,
};

const BRAND_LIGHT: HudSkin = {
  ink: LIGHT.FG.base,
  dim: LIGHT.FG.muted,
  label: LIGHT.FG.muted,
  line: LIGHT.BORDER.strong,
  panel: LIGHT.BG.elevated,
  halo: LIGHT.RAINBOW[2],
  tones: { cyan: LIGHT.RAINBOW[2], blue: LIGHT.RAINBOW[0], green: "#15803d", amber: "#b45309", red: "#be123c" },
  glow: 0.16,
  headFont: uiFontFamily,
  headWeight: 800,
  monoFont: monoFontFamily,
  lift: "#ebe5fb",
  mote: LIGHT.RAINBOW[3],
  vignette: LIGHT.BG.sunken,
  vignetteAlpha: 0.7,
  rule: `linear-gradient(90deg, ${[...LIGHT.RAINBOW].join(", ")})`,
};

/** `#rrggbb` → `#rrggbb`, channel-wise. Hex out, so callers can keep appending alpha. */
export const mixHex = (a: string, b: string, t: number): string => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0"))
    .join("")}`;
};

const lerpSkin = (a: HudSkin, b: HudSkin, t: number): HudSkin => {
  const pick = t < 0.5 ? a : b;
  return {
    ...pick,
    ink: mixHex(a.ink, b.ink, t),
    dim: mixHex(a.dim, b.dim, t),
    label: mixHex(a.label, b.label, t),
    line: mixHex(a.line, b.line, t),
    panel: mixHex(a.panel, b.panel, t),
    halo: mixHex(a.halo, b.halo, t),
    tones: Object.fromEntries(
      (Object.keys(a.tones) as Tone[]).map((k) => [k, mixHex(a.tones[k], b.tones[k], t)]),
    ) as Record<Tone, string>,
    glow: a.glow + (b.glow - a.glow) * t,
    lift: mixHex(a.lift, b.lift, t),
    mote: mixHex(a.mote, b.mote, t),
    vignette: mixHex(a.vignette, b.vignette, t),
    vignetteAlpha: a.vignetteAlpha + (b.vignetteAlpha - a.vignetteAlpha) * t,
  };
};

/** The midnite skin at a point between the dark stage (0) and the light one (1). */
export const brandSkin = (mix: number): HudSkin => lerpSkin(BRAND_DARK, BRAND_LIGHT, Math.max(0, Math.min(1, mix)));

const HudSkinContext = createContext<HudSkin>(NEON);

export const useHudSkin = (): HudSkin => useContext(HudSkinContext);

export const HudSkinProvider: React.FC<{ skin: HudSkin; children: React.ReactNode }> = ({ skin, children }) =>
  createElement(HudSkinContext.Provider, { value: skin }, children);
