import { describe, expect, it } from 'vitest';

import { createRgba, type RgbaImage } from './image';
import { ensureSeamless, repairSeam, seamPasses, seamScore, SEAM_PASS } from './seamless';

function make(w: number, h: number, f: (x: number, y: number) => [number, number, number]): RgbaImage {
  const img = createRgba(w, h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = f(x, y);
      img.data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return img;
}

/** A tileable value-noise field: a lattice that wraps, bilinearly interpolated. */
function wrappedNoise(size: number, cells = 8): RgbaImage {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 255;
  const lattice = Array.from({ length: cells * cells }, rnd);
  return make(size, size, (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)]!;
    const v = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
    return [v, v * 0.8, v * 0.6];
  });
}

const gradient = (size: number) => make(size, size, (x, y) => [(x / (size - 1)) * 255, (y / (size - 1)) * 255, 90]);

describe('seamScore', () => {
  it('fails a gradient tile, whose edges meet across a hard cut', () => {
    expect(seamScore(gradient(64), 'xy')).toBeGreaterThan(SEAM_PASS);
  });

  it('passes a tile built from wrapping noise', () => {
    expect(seamScore(wrappedNoise(64), 'xy')).toBeLessThanOrEqual(SEAM_PASS);
  });

  it('scores a flat tile as perfect', () => {
    expect(seamScore(make(16, 16, () => [10, 20, 30]))).toBe(0);
  });

  it('x only ignores a horizontal cut', () => {
    const img = make(64, 64, (_x, y) => [(y / 63) * 255, 100, 100]);
    expect(seamScore(img, 'x')).toBeLessThanOrEqual(SEAM_PASS);
    expect(seamScore(img, 'xy')).toBeGreaterThan(SEAM_PASS);
  });

  it('x only catches a vertical cut', () => {
    const img = make(64, 64, (x) => [(x / 63) * 255, 0, 0]);
    expect(seamScore(img, 'x')).toBeGreaterThan(SEAM_PASS);
  });
});

describe('repairSeam', () => {
  it('turns the gradient into a pass on both axes', () => {
    expect(seamPasses(repairSeam(gradient(64), 'xy'), 'xy')).toBe(true);
  });

  it('on x only makes a parallax layer wrap', () => {
    const img = make(128, 32, (x) => [(x / 127) * 255, 40, 40]);
    const fixed = repairSeam(img, 'x');
    expect(seamPasses(fixed, 'x')).toBe(true);
  });

  it('keeps the middle of the tile as it was', () => {
    const img = gradient(64);
    const fixed = repairSeam(img, 'xy');
    const mid = (32 * 64 + 32) * 4;
    expect(Array.from(fixed.data.slice(mid, mid + 4))).toEqual(Array.from(img.data.slice(mid, mid + 4)));
  });
});

describe('ensureSeamless', () => {
  it('returns a passing tile untouched', () => {
    const img = wrappedNoise(64);
    const r = ensureSeamless(img);
    expect(r.repaired).toBe(false);
    expect(r.image).toBe(img);
  });

  it('repairs a failing one', () => {
    const r = ensureSeamless(gradient(64));
    expect(r.repaired).toBe(true);
    expect(r.passes).toBe(true);
  });
});
