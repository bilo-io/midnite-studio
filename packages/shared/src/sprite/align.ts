import type { SpriteSheetSpec } from '../media-sprite';
import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Normalisation: every frame is cropped to its alpha, scaled by one sheet-wide factor (the reference
 * frame's height fills {@link SPRITE_FILL} of the space above the anchor) and placed so the
 * horizontal centroid of its lower body band and its lowest opaque row land on the anchor. That is
 * what stops a walk cycle from jittering.
 */
export type AlphaBox = { x0: number; y0: number; x1: number; y1: number };

/** How much of the room above the anchor the reference frame's height fills. */
export const SPRITE_FILL = 0.9;

/** The bounding box (exclusive max) of pixels with alpha above `threshold`, or null when there are none. */
export function alphaBounds(image: RgbaLike, threshold = 8): AlphaBox | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1)
      if (image.data[(y * image.width + x) * 4 + 3]! > threshold) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * X-centroid (pixel-centre coordinates of `img`) of the opaque pixels in the bottom `band` of the
 * alpha bounds — the feet, not the swinging arm. Null for an empty image.
 */
export function lowerBandCentroid(img: RgbaLike, band = 0.2, threshold = 8): number | null {
  const box = alphaBounds(img, threshold);
  if (!box) return null;
  const rows = Math.max(1, Math.round((box.y1 - box.y0) * band));
  let sum = 0;
  let n = 0;
  for (let y = box.y1 - rows; y < box.y1; y += 1)
    for (let x = box.x0; x < box.x1; x += 1)
      if (img.data[(y * img.width + x) * 4 + 3]! > threshold) {
        sum += x + 0.5;
        n += 1;
      }
  return n === 0 ? null : sum / n;
}

export function crop(img: RgbaLike, box: AlphaBox): RgbaImage {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const out = createRgba(w, h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const s = ((y + box.y0) * img.width + x + box.x0) * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) out.data[o + c] = img.data[s + c]!;
    }
  return out;
}

/** Nearest-neighbour resample (pixel mode: no new colours, no soft edges). */
export function resizeNearest(img: RgbaLike, width: number, height: number): RgbaImage {
  const out = createRgba(width, height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      const s = (sy * img.width + sx) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) out.data[o + c] = img.data[s + c]!;
    }
  }
  return out;
}

/**
 * Area-averaging resample with premultiplied alpha: each output pixel is the coverage-weighted mean
 * of the source pixels under it. Exact for shrinking; a box interpolation when enlarging.
 */
export function resizeArea(img: RgbaLike, width: number, height: number): RgbaImage {
  const out = createRgba(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y += 1) {
    const fy0 = y * sy, fy1 = fy0 + sy;
    for (let x = 0; x < width; x += 1) {
      const fx0 = x * sx, fx1 = fx0 + sx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let py = Math.floor(fy0); py < Math.min(img.height, Math.ceil(fy1)); py += 1) {
        const wy = Math.min(fy1, py + 1) - Math.max(fy0, py);
        for (let px = Math.floor(fx0); px < Math.min(img.width, Math.ceil(fx1)); px += 1) {
          const w = (Math.min(fx1, px + 1) - Math.max(fx0, px)) * wy;
          const s = (py * img.width + px) * 4;
          const alpha = img.data[s + 3]! * w;
          r += img.data[s]! * alpha;
          g += img.data[s + 1]! * alpha;
          b += img.data[s + 2]! * alpha;
          a += alpha;
          area += w;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = r / a;
        out.data[o + 1] = g / a;
        out.data[o + 2] = b / a;
      }
      out.data[o + 3] = area > 0 ? a / area : 0;
    }
  }
  return out;
}

export type NormaliseOptions = {
  frameSize: readonly [number, number];
  anchor: { x: number; y: number };
  /** Bounds height (source pixels) of the sheet's reference frame. */
  referenceHeight: number;
  /** Pixel mode: nearest-neighbour scaling. */
  pixel?: boolean;
  /** `anchorNudge` from `frames.json`, added after placement. */
  nudge?: readonly [number, number];
  /** A fixed scale instead of {@link spriteScale} — rendered frames (Theme E) are already at sheet scale (1). */
  scale?: number;
};

export type NormalisedFrame = { image: RgbaImage; scale: number; offset: [number, number] };

/** One sheet-wide scale: the reference frame fills {@link SPRITE_FILL} of the room above the anchor. */
export function spriteScale(opts: Pick<NormaliseOptions, 'frameSize' | 'anchor' | 'referenceHeight'>): number {
  const room = Math.max(1, opts.anchor.y * opts.frameSize[1] * SPRITE_FILL);
  return opts.referenceHeight > 0 ? room / opts.referenceHeight : 1;
}

/** Crop, scale and anchor one frame onto a transparent `frameSize` canvas. */
export function normaliseFrame(img: RgbaLike, opts: NormaliseOptions): NormalisedFrame {
  const [fw, fh] = opts.frameSize;
  const out = createRgba(fw, fh);
  const box = alphaBounds(img);
  if (!box) return { image: out, scale: 1, offset: [0, 0] };
  const cropped = crop(img, box);
  const scale = opts.scale ?? spriteScale(opts);
  const sw = Math.max(1, Math.round(cropped.width * scale));
  const sh = Math.max(1, Math.round(cropped.height * scale));
  const scaled = opts.pixel ? resizeNearest(cropped, sw, sh) : resizeArea(cropped, sw, sh);
  const cx = lowerBandCentroid(scaled) ?? sw / 2;
  const [nx, ny] = opts.nudge ?? [0, 0];
  const ox = Math.round(opts.anchor.x * fw - cx) + nx;
  const oy = Math.round(opts.anchor.y * fh - sh) + ny;
  for (let y = 0; y < sh; y += 1) {
    const ty = y + oy;
    if (ty < 0 || ty >= fh) continue;
    for (let x = 0; x < sw; x += 1) {
      const tx = x + ox;
      if (tx < 0 || tx >= fw) continue;
      const s = (y * sw + x) * 4;
      const o = (ty * fw + tx) * 4;
      for (let c = 0; c < 4; c += 1) out.data[o + c] = scaled.data[s + c]!;
    }
  }
  return { image: out, scale, offset: [ox, oy] };
}

/**
 * Which frame sets the sheet's scale: `idle/<dir>/000` when the sheet has an idle clip, else frame 0
 * of the first clip. A frame source submits it first in each direction.
 */
export function spriteReferenceFrame(spec: Pick<SpriteSheetSpec, 'clips'>): { clip: string; n: 0 } | null {
  const idle = spec.clips.find((c) => c.name === 'idle');
  const clip = idle ?? spec.clips[0];
  return clip ? { clip: clip.name, n: 0 } : null;
}
