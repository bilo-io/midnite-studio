import { CUSTOM_LOOP_COLOR, isCustomLoop, type LoopDefinition } from '@midnite/studio-shared';
import type { CSSProperties } from 'react';

/**
 * A custom loop's colour, as the same five `--fab-spec-*` stops and two arc
 * angles a built-in declares in `styles.css` — computed from its `hue` rather
 * than written down, because the author picks the hue.
 *
 * A built-in's table is "the arc anchor ± 60°, sampled every 30°, off the six
 * 60°-apart ramp stops, midpoints computed once". This is that recipe as a
 * function, over the same six channel triplets the tables use, so a palette
 * pick of a built-in's anchor reproduces that built-in's stops (to within one
 * unit of rounding — `loop-spectrum.test.ts` holds it to that).
 *
 * The values ride inline on whichever element carries `data-fab-custom`, and
 * `styles.css` maps that attribute's `--fab-custom-arc-*` onto the registered
 * `--fab-arc-*` pair, which are `inherits: false` and so cannot be set inline
 * on an ancestor and read by a descendant or a pseudo-element.
 */

/** The ramp the built-in tables are sampled from: 0°, 60° … 300°. */
const RAMP: readonly (readonly [number, number, number])[] = [
  [244, 63, 94], //    0° rose
  [245, 158, 11], //  60° amber
  [16, 185, 129], // 120° emerald
  [59, 130, 246], // 180° blue
  [139, 92, 246], // 240° violet
  [236, 72, 153], // 300° pink
];

/**
 * The tab glyph's class for every custom loop — `CUSTOM_LOOP_COLOR`, restated
 * here as a literal because Tailwind scans this package and not `shared`.
 * `satisfies` keeps the two from drifting.
 */
export const CUSTOM_LOOP_TEXT_CLASS = 'text-[rgb(var(--fab-spec-3))]' satisfies typeof CUSTOM_LOOP_COLOR;

function normaliseHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** The ramp's colour at `hue`, linearly between its two neighbouring stops. */
export function rampAt(hue: number): [number, number, number] {
  const h = normaliseHue(hue);
  const index = Math.floor(h / 60);
  const t = (h - index * 60) / 60;
  const a = RAMP[index % 6]!;
  const b = RAMP[(index + 1) % 6]!;
  return [0, 1, 2].map((i) => Math.floor(a[i]! + (b[i]! - a[i]!) * t)) as [number, number, number];
}

/** The five stops (`anchor-60` … `anchor+60`) as `"r g b"` triplets. */
export function spectrumStops(hue: number): string[] {
  return [-60, -30, 0, 30, 60].map((offset) => rampAt(hue + offset).join(' '));
}

/** The centre stop as a hex — for the few surfaces that paint outside the panel. */
export function spectrumHex(hue: number): string {
  return `#${rampAt(hue)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The inline custom properties that paint one custom loop. */
export function spectrumStyle(hue: number): CSSProperties {
  const h = normaliseHue(hue);
  const stops = spectrumStops(h);
  return {
    '--fab-spec-1': stops[0],
    '--fab-spec-2': stops[1],
    '--fab-spec-3': stops[2],
    '--fab-spec-4': stops[3],
    '--fab-spec-5': stops[4],
    '--fab-custom-arc-from': `${h - 60}deg`,
    '--fab-custom-arc-to': `${h + 60}deg`,
  } as CSSProperties;
}

/**
 * The attributes to spread on an element that otherwise says
 * `data-fab-tab={loop.id}`: nothing for a built-in (its row in `styles.css`
 * does the work), the inline spectrum plus `data-fab-custom` for a custom loop.
 */
export function loopSpectrumProps(
  loop: LoopDefinition | undefined,
): { 'data-fab-custom'?: 'true'; style?: CSSProperties } {
  if (!loop || !isCustomLoop(loop)) return {};
  return { 'data-fab-custom': 'true', style: spectrumStyle(loop.hue) };
}
