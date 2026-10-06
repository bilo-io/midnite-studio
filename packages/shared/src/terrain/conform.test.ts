import { describe, expect, it } from 'vitest';

import { conformRoads, flattenFootprints, pointInPolygon } from './conform';
import { gridToWorld, sampleHeight } from './field-sample';
import type { Heightfield } from './heightfield';

/** 129² over 128 m (1 m cells), rising 0.2 m per metre in +z — a cross-slope for a road along x. */
function slope(): Heightfield {
  const n = 129;
  const heights = new Float32Array(n * n);
  for (let z = 0; z < n; z += 1) for (let x = 0; x < n; x += 1) heights[z * n + x] = 10 + 0.2 * (z - 64) + 0.05 * (x - 64);
  return { resolution: n, worldSize: 128, heights };
}

describe('conformRoads', () => {
  const road = { id: 0, path: [[-60, 0], [60, 0]] as [number, number][], widthM: 8 };

  it('levels the terrain across the road width', () => {
    const { field, warnings } = conformRoads(slope(), [road], { blendM: 6, maxCutFillM: 10 });
    expect(warnings).toEqual([]);
    for (const x of [-30, -10, 0, 10, 30]) {
      const centre = sampleHeight(field, x, 0);
      for (const dz of [-3, -1, 1, 3]) expect(Math.abs(sampleHeight(field, x, dz) - centre)).toBeLessThan(1e-4);
    }
  });

  it('blends back to the original ground beyond the corridor', () => {
    const original = slope();
    const { field } = conformRoads(original, [road], { blendM: 6, maxCutFillM: 10 });
    const n = field.resolution;
    for (let gx = 0; gx < n; gx += 8) {
      for (const gz of [64 + 12, 64 - 12]) {
        expect(field.heights[gz * n + gx]).toBe(original.heights[gz * n + gx]);
      }
    }
  });

  it('clamps cut/fill and warns once per edge', () => {
    const { field, warnings } = conformRoads(slope(), [road], { blendM: 6, maxCutFillM: 0.1 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Road 0');
    const original = slope();
    for (let i = 0; i < field.heights.length; i += 1) {
      expect(Math.abs(field.heights[i]! - original.heights[i]!)).toBeLessThanOrEqual(0.1 + 1e-5);
    }
  });
});

describe('flattenFootprints', () => {
  it('leaves the footprint level at its mean height and reports it as baseY', () => {
    const square: [number, number][] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    const { field, buildings } = flattenFootprints(slope(), [{ polygon: square, baseY: 0, height: 8 }], 3);
    const n = field.resolution;
    const inside: number[] = [];
    for (let gz = 0; gz < n; gz += 1) {
      for (let gx = 0; gx < n; gx += 1) {
        const [x, z] = gridToWorld(field, gx, gz);
        if (pointInPolygon(x, z, square)) inside.push(field.heights[gz * n + gx]!);
      }
    }
    const mean = inside.reduce((s, v) => s + v, 0) / inside.length;
    const variance = inside.reduce((s, v) => s + (v - mean) ** 2, 0) / inside.length;
    expect(inside.length).toBeGreaterThan(300);
    expect(variance).toBeLessThan(1e-9);
    expect(buildings[0]!.baseY).toBeCloseTo(mean, 1);
    // Untouched far outside the blend.
    expect(sampleHeight(field, 40, 40)).toBeCloseTo(sampleHeight(slope(), 40, 40), 5);
  });
});
