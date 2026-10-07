import { describe, expect, it } from 'vitest';

import { diffFrames } from './frame-diff';

const solid = (w: number, h: number, v: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });

describe('diffFrames', () => {
  it('reports a 10×10 changed square in 100×100 as 0.01', () => {
    const a = solid(100, 100, 40);
    const b = solid(100, 100, 40);
    for (let y = 20; y < 30; y += 1) for (let x = 50; x < 60; x += 1) b.data[(y * 100 + x) * 4] = 200;
    const result = diffFrames(a, b);
    expect(result.changedFraction).toBeCloseTo(0.01, 10);
    expect(result.changedPixels).toBe(100);
    const at = (x: number, y: number) => Array.from(result.diff.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4));
    expect(at(55, 25)).toEqual([255, 0, 255, 255]);
    expect(at(0, 0)).toEqual([10, 10, 10, 255]);
  });

  it('ignores differences within the threshold', () => {
    expect(diffFrames(solid(4, 4, 100), solid(4, 4, 116)).changedFraction).toBe(0);
    expect(diffFrames(solid(4, 4, 100), solid(4, 4, 117)).changedFraction).toBe(1);
    expect(diffFrames(solid(4, 4, 100), solid(4, 4, 110), { threshold: 5 }).changedFraction).toBe(1);
  });

  it('treats a size mismatch as fully changed', () => {
    expect(diffFrames(solid(4, 4, 0), solid(5, 4, 0)).changedFraction).toBe(1);
  });
});
