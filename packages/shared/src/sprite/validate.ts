import type { SpriteBadge, SpriteSheetSpec } from '../media-sprite';
import { alphaBounds, lowerBandCentroid } from './align';
import { opaqueFraction, type RgbaLike } from './image';

/**
 * The per-frame validation report. The pipeline measures each frame as it is processed (so nothing
 * but these few numbers is held across a sheet), then {@link validateFrames} turns the measures into
 * badges once the sheet is complete — the height rule needs the clip median.
 */
export type SpriteFrameMeasure = {
  /** Opaque fraction of the keyed source, before normalisation. */
  opaque: number;
  /** An opaque pixel on the source's outer row or column: the subject was cut off. */
  clipped: boolean;
  /** Alpha-bounds height after normalisation (0 when empty). */
  height: number;
  /** Lower-band centroid's distance from the anchor after normalisation, px. */
  drift: number;
};

/** The badges this pipeline owns; D adds `inconsistent`/`unchecked`, F adds `grid`. */
export const SPRITE_PIPELINE_BADGES = ['empty', 'clipped', 'height', 'drift'] as const satisfies readonly SpriteBadge[];

export const SPRITE_EMPTY_FRACTION = 0.01;
export const SPRITE_HEIGHT_TOLERANCE = 0.12;
/** `drift` fires past `max(2, 0.04 × frameWidth)` px. */
export const spriteDriftLimit = (frameWidth: number): number => Math.max(2, 0.04 * frameWidth);

function touchesEdge(img: RgbaLike, threshold = 8): boolean {
  const { width: w, height: h, data } = img;
  const a = (x: number, y: number) => data[(y * w + x) * 4 + 3]! > threshold;
  for (let x = 0; x < w; x += 1) if (a(x, 0) || a(x, h - 1)) return true;
  for (let y = 0; y < h; y += 1) if (a(0, y) || a(w - 1, y)) return true;
  return false;
}

export function measureFrame(
  source: RgbaLike,
  normalised: RgbaLike,
  spec: Pick<SpriteSheetSpec, 'frameSize' | 'anchor'>,
): SpriteFrameMeasure {
  const box = alphaBounds(normalised);
  const cx = lowerBandCentroid(normalised);
  return {
    opaque: opaqueFraction(source),
    clipped: touchesEdge(source),
    height: box ? box.y1 - box.y0 : 0,
    drift: cx === null ? 0 : Math.abs(cx - spec.anchor.x * spec.frameSize[0]),
  };
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Frame key (`<clip>/<dir>/<n>`) → the pipeline's badges for it (`[]` for a clean frame). */
export function validateFrames(
  measures: Readonly<Record<string, SpriteFrameMeasure>>,
  spec: Pick<SpriteSheetSpec, 'frameSize'>,
): Record<string, SpriteBadge[]> {
  const byClip = new Map<string, number[]>();
  for (const [key, m] of Object.entries(measures)) {
    if (m.opaque < SPRITE_EMPTY_FRACTION) continue;
    const clip = key.split('/')[0]!;
    byClip.set(clip, [...(byClip.get(clip) ?? []), m.height]);
  }
  const medians = new Map([...byClip].map(([clip, hs]) => [clip, median(hs)]));
  const limit = spriteDriftLimit(spec.frameSize[0]);
  const out: Record<string, SpriteBadge[]> = {};
  for (const [key, m] of Object.entries(measures)) {
    const badges: SpriteBadge[] = [];
    if (m.opaque < SPRITE_EMPTY_FRACTION) {
      out[key] = ['empty'];
      continue;
    }
    if (m.clipped) badges.push('clipped');
    const med = medians.get(key.split('/')[0]!) ?? m.height;
    if (med > 0 && Math.abs(m.height - med) > SPRITE_HEIGHT_TOLERANCE * med) badges.push('height');
    if (m.drift > limit) badges.push('drift');
    out[key] = badges;
  }
  return out;
}
