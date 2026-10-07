import { cloneRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Seamless tiling checks (Phase 106 Theme H). A base tile is only usable if it wraps: laid side by
 * side its edges must read as one more interior step, not a cut.
 *
 * - {@link seamScore} is the mean absolute RGB difference across the **wrapped** seam divided by the
 *   mean difference between adjacent interior columns (and rows); `≤ {@link SEAM_PASS}` passes.
 * - {@link repairSeam} blends the image with itself shifted by half, weighted so the edges come
 *   entirely from the shifted copy — whose own seam sits in the middle of the original, where the
 *   pixels were already neighbours. The blend runs over `band` pixels (default `size / 8`).
 */
export const SEAM_PASS = 1.5;

export type SeamAxes = 'xy' | 'x';

/**
 * The mean absolute difference between pixel `a` and pixel `b` (byte offsets) over premultiplied RGB and
 * alpha, so a transparent pixel's hidden colour never counts and an opaque tile scores as plain RGB.
 */
const diff = (d: ArrayLike<number>, a: number, b: number): number => {
  const pa = d[a + 3]! / 255, pb = d[b + 3]! / 255;
  return (Math.abs(d[a]! * pa - d[b]! * pb) + Math.abs(d[a + 1]! * pa - d[b + 1]! * pb) + Math.abs(d[a + 2]! * pa - d[b + 2]! * pb) + Math.abs(d[a + 3]! - d[b + 3]!)) / 4;
};

/** Sum and count of differences between each pixel and its right (`x`) or lower (`y`) neighbour, wrapped or not. */
function axisDiffs(img: RgbaLike, axis: 'x' | 'y'): { seam: number; interior: number } {
  const { width: w, height: h, data } = img;
  let seam = 0, seamN = 0, interior = 0, interiorN = 0;
  if (axis === 'x') {
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const a = (y * w + x) * 4;
        const wrapped = x === w - 1;
        const b = (y * w + (wrapped ? 0 : x + 1)) * 4;
        if (wrapped) { seam += diff(data, a, b); seamN += 1; } else { interior += diff(data, a, b); interiorN += 1; }
      }
  } else {
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const a = (y * w + x) * 4;
        const wrapped = y === h - 1;
        const b = ((wrapped ? 0 : y + 1) * w + x) * 4;
        if (wrapped) { seam += diff(data, a, b); seamN += 1; } else { interior += diff(data, a, b); interiorN += 1; }
      }
  }
  return { seam: seamN ? seam / seamN : 0, interior: interiorN ? interior / interiorN : 0 };
}

/**
 * Seam difference over interior difference. A flat image is `0`; a flat interior with a visible seam
 * divides by 1 grey level instead, so the score stays finite and large.
 */
export function seamScore(img: RgbaLike, axes: SeamAxes = 'xy'): number {
  const parts = [axisDiffs(img, 'x'), ...(axes === 'xy' ? [axisDiffs(img, 'y')] : [])];
  const seam = parts.reduce((s, p) => s + p.seam, 0) / parts.length;
  const interior = parts.reduce((s, p) => s + p.interior, 0) / parts.length;
  return seam / Math.max(interior, 1);
}

export const seamPasses = (img: RgbaLike, axes: SeamAxes = 'xy'): boolean => seamScore(img, axes) <= SEAM_PASS;

/** The cross-fade weight (towards the original) at distance `d` from the nearest edge. */
const weight = (d: number, band: number): number => {
  const t = Math.min(1, Math.max(0, d / band));
  return t * t * (3 - 2 * t);
};

/** Repairs the wrapped seam on `axes` by cross-fading a `band`-pixel margin with the half-shifted copy. */
export function repairSeam(img: RgbaImage, axes: SeamAxes = 'xy', band = Math.max(1, Math.round(Math.min(img.width, img.height) / 8))): RgbaImage {
  let out = cloneRgba(img);
  for (const axis of axes === 'xy' ? (['x', 'y'] as const) : (['x'] as const)) {
    const src = out;
    const next = cloneRgba(src);
    const { width: w, height: h } = src;
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const edge = axis === 'x' ? Math.min(x, w - 1 - x) : Math.min(y, h - 1 - y);
        const wt = weight(edge, band);
        if (wt >= 1) continue;
        const sx = axis === 'x' ? (x + (w >> 1)) % w : x;
        const sy = axis === 'y' ? (y + (h >> 1)) % h : y;
        const o = (y * w + x) * 4;
        const s = (sy * w + sx) * 4;
        const a1 = src.data[o + 3]! * wt, a2 = src.data[s + 3]! * (1 - wt);
        const alpha = a1 + a2;
        next.data[o + 3] = Math.round(alpha);
        if (alpha > 0) for (let c = 0; c < 3; c += 1) next.data[o + c] = Math.round((src.data[o + c]! * a1 + src.data[s + c]! * a2) / alpha);
      }
    out = next;
  }
  return out;
}

/** Checks a tile and repairs it when it fails; `repaired` says whether the repair was needed, `passes` the final verdict. */
export function ensureSeamless(img: RgbaImage, axes: SeamAxes = 'xy', band?: number): { image: RgbaImage; score: number; repaired: boolean; passes: boolean } {
  const score = seamScore(img, axes);
  if (score <= SEAM_PASS) return { image: img, score, repaired: false, passes: true };
  const image = repairSeam(img, axes, band);
  const after = seamScore(image, axes);
  return { image, score: after, repaired: true, passes: after <= SEAM_PASS };
}
