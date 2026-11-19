import { accentHues, color } from '@bilo-io/ui/tokens';

import { hsl, type ColorScheme, type KindAccent, type StatusAccent } from './palette';

// WCAG 2.x contrast over the theme's own colour strings (`hsl()` / `hsla()`,
// as palette.ts emits them, or `#rrggbb`). A translucent colour is composited
// over the background it is measured against, which is how it is drawn.

type Rgba = [r: number, g: number, b: number, a: number];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** `hsl(…)`, `hsla(…)` (comma or space form) or `#rrggbb` → linear-free sRGB 0–1 plus alpha. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!.length === 3 ? hex[1]!.replace(/./g, '$&$&') : hex[1]!;
    const n = parseInt(digits, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const fn = /^hsla?\(([^)]*)\)$/i.exec(value);
  if (fn) {
    const parts = fn[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) => parseFloat(p));
    const [h = 0, s = 0, l = 0, a = 1] = parts;
    return [...hslToRgb(((h % 360) + 360) % 360, s / 100, l / 100), a];
  }
  throw new Error(`ui-native: cannot read the colour "${input}"`);
}

function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The WCAG contrast ratio (1–21) of `fg` drawn on `bg`. A translucent `fg` is
 * composited over `bg`; a translucent `bg` is composited over white.
 */
export function contrastRatio(fg: string, bg: string): number {
  const back = composite(parseColor(bg), [1, 1, 1, 1]);
  const front = composite(parseColor(fg), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` over `tint` laid on `bg` at `alpha`: text on a translucent badge or diff row. */
export function contrastOverTint(fg: string, tint: string, alpha: number, bg: string): number {
  const back = composite(parseColor(bg), [1, 1, 1, 1]);
  const [r, g, b] = parseColor(tint);
  const under = composite([r, g, b, alpha], back);
  const asHex = (rgb: Rgba) =>
    `#${rgb
      .slice(0, 3)
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  return contrastRatio(fg, asHex(under));
}

export type LowContrastAccent = {
  scheme: ColorScheme;
  group: 'status' | 'kind';
  name: StatusAccent | KindAccent;
  ratio: number;
};

/** The WCAG 1.4.11 floor for strokes and dots. */
export const NON_TEXT_CONTRAST = 3;

/**
 * Every accent under 3:1 against its scheme's background. A component drawing
 * one of these as a stroke or dot adds a 1dp `border` outline so it still reads.
 */
export const LOW_CONTRAST_ACCENTS: readonly LowContrastAccent[] = (
  ['light', 'dark'] as const
).flatMap((scheme) => {
  const bg = hsl(color[scheme].background);
  return (['status', 'kind'] as const).flatMap((group) =>
    Object.entries(accentHues[group][scheme]).flatMap(([name, triplet]) => {
      const ratio = contrastRatio(hsl(triplet), bg);
      return ratio < NON_TEXT_CONTRAST
        ? [{ scheme, group, name: name as StatusAccent | KindAccent, ratio: +ratio.toFixed(2) }]
        : [];
    }),
  );
});

/** Whether an accent needs the 1dp outline in this scheme. */
export function isLowContrastAccent(
  scheme: ColorScheme,
  group: 'status' | 'kind',
  name: string,
): boolean {
  return LOW_CONTRAST_ACCENTS.some(
    (a) => a.scheme === scheme && a.group === group && a.name === name,
  );
}

/** Black or white text for a `#rrggbb` fill, whichever reads (WCAG luminance split at 0.179). */
export function contrastTextForHex(hex: string): '#000000' | '#ffffff' {
  return luminance(parseColor(hex)) > 0.179 ? '#000000' : '#ffffff';
}
