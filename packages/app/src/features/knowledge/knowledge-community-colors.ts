import { TAB_GROUP_COLORS } from '../browser/tab-group-colors';
import { hslTripleToRgbString } from './knowledge-color-math';

/**
 * Community colour, Theme D's own requirement: "reads the same CSS custom
 * properties every other surface does and repaints on theme change — no
 * hardcoded palette." Reuses `--tab-group-N` (`tab-group-colors.ts`) rather
 * than inventing a fourth palette — same idea (deterministic colour for an
 * arbitrary id, from a themed token), already proven for the browser's tab
 * groups.
 *
 * Eight hue buckets isn't enough variety for ~600 communities on its own, so
 * a community's bucket (hue/saturation, from the token) is combined with a
 * lightness TIER derived from the same id — `8 * LIGHTNESS_OFFSETS.length`
 * distinguishable colours, still entirely sourced from the theme's own
 * tokens (only the offset is invented, and it is relative, not absolute).
 */
const LIGHTNESS_OFFSETS = [0, -14, 14, -26, 26] as const;

/** Percentage-point offsets applied to the token's own lightness, clamped to stay legible in both themes. */
const MIN_LIGHTNESS = 12;
const MAX_LIGHTNESS = 88;

export type HslTriple = { h: number; s: number; l: number };

/** Parses a `styles.css`-style HSL triple, e.g. `"217 91% 60%"`, into numbers. `null` if it doesn't parse. */
export function parseHslTriple(raw: string): HslTriple | null {
  const match = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(raw);
  if (!match) return null;
  const [, h, s, l] = match;
  return { h: Number(h), s: Number(s), l: Number(l) };
}

function clampLightness(l: number): number {
  return Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l));
}

/** Deterministic hue-bucket + lightness-tier index for a community number. */
export function communityColorBucket(community: number): { hueIndex: number; tierIndex: number } {
  const hueIndex = ((community % TAB_GROUP_COLORS.length) + TAB_GROUP_COLORS.length) % TAB_GROUP_COLORS.length;
  const tier = Math.floor(community / TAB_GROUP_COLORS.length);
  const tierIndex = ((tier % LIGHTNESS_OFFSETS.length) + LIGHTNESS_OFFSETS.length) % LIGHTNESS_OFFSETS.length;
  return { hueIndex, tierIndex };
}

/**
 * A community's colour as a plain `rgb(...)` string sigma can paint directly
 * (a WebGL canvas draws pixels, not CSS — `var(--x)` means nothing to it, and
 * sigma's own colour parser recognises `#hex`/`rgb()` only, never `hsl()` —
 * see `knowledge-color-math.ts`'s docblock). `resolveToken` reads
 * `getComputedStyle(document.documentElement)` in the real hook; passed in
 * here so this stays a pure, vitest-only function.
 */
export function communityColor(community: number, resolveToken: (name: string) => string): string {
  const { hueIndex, tierIndex } = communityColorBucket(community);
  const tokenName = TAB_GROUP_COLORS[hueIndex]!;
  const parsed = parseHslTriple(resolveToken(tokenName));
  if (!parsed) return 'rgb(136, 136, 136)';
  const l = clampLightness(parsed.l + LIGHTNESS_OFFSETS[tierIndex]!);
  return hslTripleToRgbString(parsed.h, parsed.s, l);
}
