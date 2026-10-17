/**
 * SF3D's input picture: 512×512 RGB in [0, 1], the object centred and filling 85% of the frame on a
 * 50% grey background — what `run.py` builds with `rembg` + `resize_foreground(0.85)`. There is no
 * background remover here: a picture with transparency is cropped to its alpha, an opaque one is
 * fitted whole (so a cut-out PNG gives SF3D's intended input, and a photo gives its background too).
 */
import { alphaBounds } from '@midnite/studio-shared';

export const SF3D_INPUT_SIZE = 512;
export const SF3D_FOREGROUND_RATIO = 0.85;
const BACKGROUND = 0.5;

export type RgbaImage = { data: Uint8Array; width: number; height: number };

/** Moved to the shared sprite kernel (Phase 106 Theme B); re-exported for SF3D's callers. */
export { alphaBounds };

const hasTransparency = (image: RgbaImage): boolean => {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! < 250) return true;
  return false;
};

/** `[512, 512, 3]` float32, row-major (HWC) — the tokenizer's `rgb` without its batch dimension. */
export function prepareSf3dInput(image: RgbaImage, size: number = SF3D_INPUT_SIZE): Float32Array {
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('The picture could not be read.');
  }
  const cutout = hasTransparency(image);
  const box = (cutout ? alphaBounds(image) : null) ?? { x0: 0, y0: 0, x1: image.width, y1: image.height };
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const target = cutout ? size * SF3D_FOREGROUND_RATIO : size;
  const scale = target / Math.max(bw, bh);
  const ox = (size - bw * scale) / 2;
  const oy = (size - bh * scale) / 2;

  const out = new Float32Array(size * size * 3);
  const px = (x: number, y: number, c: number) => image.data[(y * image.width + x) * 4 + c]! / 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Source coordinate of this pixel's centre.
      const sx = box.x0 + (x + 0.5 - ox) / scale - 0.5;
      const sy = box.y0 + (y + 0.5 - oy) / scale - 0.5;
      const o = (y * size + x) * 3;
      if (sx < box.x0 - 0.5 || sy < box.y0 - 0.5 || sx > box.x1 - 0.5 || sy > box.y1 - 0.5) {
        out[o] = out[o + 1] = out[o + 2] = BACKGROUND;
        continue;
      }
      const x0 = Math.max(box.x0, Math.min(box.x1 - 1, Math.floor(sx)));
      const y0 = Math.max(box.y0, Math.min(box.y1 - 1, Math.floor(sy)));
      const x1 = Math.min(box.x1 - 1, x0 + 1);
      const y1 = Math.min(box.y1 - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      const taps: [number, number, number][] = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ];
      // Premultiplied: colour weighted by alpha, then composited over grey.
      let r = 0, g = 0, b = 0, a = 0;
      for (const [tx, ty, w] of taps) {
        const alpha = px(tx, ty, 3) * w;
        r += px(tx, ty, 0) * alpha;
        g += px(tx, ty, 1) * alpha;
        b += px(tx, ty, 2) * alpha;
        a += alpha;
      }
      out[o] = r + BACKGROUND * (1 - a);
      out[o + 1] = g + BACKGROUND * (1 - a);
      out[o + 2] = b + BACKGROUND * (1 - a);
    }
  }
  return out;
}

/** SF3D's conditioning camera: `default_cond_c2w(distance=1.6)` — row-major 4×4. */
export function sf3dCameraToWorld(distance = 1.6): Float32Array {
  return Float32Array.from([0, 0, 1, distance, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
}

/** SF3D's normalised intrinsics for a 40° field of view on a square input — row-major 3×3. */
export function sf3dIntrinsicNormed(fovDeg = 40): Float32Array {
  const focal = 0.5 / Math.tan((fovDeg * Math.PI) / 360);
  return Float32Array.from([focal, 0, 0.5, 0, focal, 0.5, 0, 0, 1]);
}
