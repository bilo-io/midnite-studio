import { cloneRgba, deltaE, hexToRgb, type RgbaImage } from './image';

/**
 * Background removal. A provider that returns real alpha (OpenAI with `background: 'transparent'`)
 * keeps it; every other provider is asked for a flat chroma background, which {@link keyChroma}
 * removes with despill and a 1 px edge clean-up.
 */
export const SPRITE_CHROMA_MAGENTA = '#ff00ff';
export const SPRITE_CHROMA_GREEN = '#00ff00';
export type SpriteChroma = typeof SPRITE_CHROMA_MAGENTA | typeof SPRITE_CHROMA_GREEN;

/** Words that mean the subject itself is magenta-ish, so a magenta key would eat it. */
export const MAGENTA_WORDS = ['magenta', 'pink', 'purple', 'fuchsia', 'violet', 'lilac', 'mauve', 'rose'] as const;
const MAGENTA_RE = new RegExp(`\\b(${MAGENTA_WORDS.join('|')})\\b`, 'i');

/** ΔE under which a palette colour counts as "magenta". */
export const MAGENTA_DELTA_E = 25;

/** Green when the prompt or palette is magenta-ish; magenta otherwise. */
export function chooseChroma(prompt: string, palette?: readonly string[]): SpriteChroma {
  if (MAGENTA_RE.test(prompt)) return SPRITE_CHROMA_GREEN;
  const magenta = hexToRgb(SPRITE_CHROMA_MAGENTA);
  if (palette?.some((hex) => deltaE(hexToRgb(hex), magenta) < MAGENTA_DELTA_E)) return SPRITE_CHROMA_GREEN;
  return SPRITE_CHROMA_MAGENTA;
}

/** The sentence appended to a generation prompt for providers without real transparency. */
export function chromaPromptClause(chroma: SpriteChroma): string {
  const name = chroma === SPRITE_CHROMA_GREEN ? 'pure green' : 'pure magenta';
  return `Place the subject on a perfectly flat, uniform ${name} (${chroma}) background with no shadow, gradient, texture or floor, and do not use that colour anywhere on the subject.`;
}

/** Providers whose adapter can return real alpha (Decision 6). */
export const SPRITE_ALPHA_PROVIDERS: readonly string[] = ['openai'];

/** How one provider is asked for a removable background. */
export function spriteBackgroundRequest(
  provider: string,
  prompt: string,
  palette?: readonly string[],
): { transparent: true; clause: '' } | { transparent: false; clause: string; chroma: SpriteChroma } {
  if (SPRITE_ALPHA_PROVIDERS.includes(provider)) return { transparent: true, clause: '' };
  const chroma = chooseChroma(prompt, palette);
  return { transparent: false, clause: chromaPromptClause(chroma), chroma };
}

/**
 * Despill also reaches opaque pixels this close to the chroma (in softness widths past the soft band):
 * a rim pixel half-blended with magenta is opaque by distance yet still visibly magenta.
 */
export const SPILL_REACH = 4;

export type KeyOptions = { tolerance?: number; softness?: number };

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Keys out a flat chroma background:
 * 1. alpha from RGB distance to the chroma (normalised to [0, 1]), smoothstepped between
 *    `tolerance` and `tolerance + softness`;
 * 2. despill on semi-transparent pixels and on opaque ones still close to the chroma — the chroma's dominant channels lose the amount by which
 *    they exceed the other channel(s), so an edge blended with magenta loses its magenta, not its hue;
 * 3. a 1 px erode: an edge pixel with alpha < 0.5 next to a fully transparent one is cleared.
 */
export function keyChroma(img: RgbaImage, chroma: string, { tolerance = 0.18, softness = 0.08 }: KeyOptions = {}): RgbaImage {
  const [cr, cg, cb] = hexToRgb(chroma);
  const green = cg > cr && cg > cb;
  const out = cloneRgba(img);
  const d = out.data;
  const max = 255 * Math.sqrt(3);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const dist = Math.hypot(r - cr, g - cg, b - cb) / max;
    const a = smoothstep(tolerance, tolerance + softness, dist);
    d[i + 3] = Math.round(a * d[i + 3]!);
    if (a < 1 || dist < tolerance + SPILL_REACH * softness) {
      if (green) {
        const spill = g - Math.max(r, b);
        if (spill > 0) d[i + 1] = g - spill;
      } else {
        const spill = Math.min(r, b) - g;
        if (spill > 0) {
          d[i] = r - spill;
          d[i + 2] = b - spill;
        }
      }
    }
  }
  // 1 px erode of soft edges touching the background.
  const { width: w, height: h } = out;
  const clear: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const alpha = d[o + 3]!;
      if (alpha === 0 || alpha >= 128) continue;
      const transparent = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < w && ny < h && d[(ny * w + nx) * 4 + 3] === 0;
      if (transparent(x - 1, y) || transparent(x + 1, y) || transparent(x, y - 1) || transparent(x, y + 1)) clear.push(o);
    }
  }
  for (const o of clear) d[o + 3] = 0;
  return out;
}
