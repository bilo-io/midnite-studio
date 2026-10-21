import type { RgbaImage, RgbaLike } from '../sprite/image';

/**
 * Pixel diff for play-test frame assertions (Phase 107 Theme O). A pixel
 * differs when any of its four channels differs by more than `threshold`;
 * images of different sizes differ everywhere. The diff image paints changed
 * pixels opaque magenta over a dimmed copy of `b`, so a reviewer sees where.
 */
export type FrameDiff = { changedFraction: number; changedPixels: number; diff: RgbaImage };

export const FRAME_DIFF_THRESHOLD = 16;
export const FRAME_DIFF_TOLERANCE = 0.01;

export function diffFrames(a: RgbaLike, b: RgbaLike, options: { threshold?: number } = {}): FrameDiff {
  const threshold = options.threshold ?? FRAME_DIFF_THRESHOLD;
  const width = b.width;
  const height = b.height;
  const total = width * height;
  const diff: RgbaImage = { width, height, data: new Uint8ClampedArray(total * 4) };
  const sameSize = a.width === b.width && a.height === b.height;
  let changed = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    let differs = !sameSize;
    if (sameSize) {
      for (let c = 0; c < 4; c += 1) {
        if (Math.abs(a.data[o + c]! - b.data[o + c]!) > threshold) {
          differs = true;
          break;
        }
      }
    }
    if (differs) {
      changed += 1;
      diff.data[o] = 255;
      diff.data[o + 1] = 0;
      diff.data[o + 2] = 255;
    } else {
      diff.data[o] = b.data[o]! >> 2;
      diff.data[o + 1] = b.data[o + 1]! >> 2;
      diff.data[o + 2] = b.data[o + 2]! >> 2;
    }
    diff.data[o + 3] = 255;
  }
  const changedFraction = sameSize ? (total === 0 ? 0 : changed / total) : 1;
  return { changedFraction, changedPixels: changed, diff };
}
