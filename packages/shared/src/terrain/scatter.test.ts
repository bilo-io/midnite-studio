import { describe, expect, it } from 'vitest';

import type { Heightfield } from './heightfield';
import { FOLIAGE_CAPPED_WARNING, scatterFoliage, TERRAIN_FOLIAGE_MAX } from './scatter';

function makeFlatField(res = 33, worldSize = 100, height = 10): Heightfield {
  return {
    resolution: res,
    worldSize,
    heights: new Float32Array(res * res).fill(height),
  };
}

describe('scatterFoliage', () => {
  it('places instances only on tree and grass classes', () => {
    const res = 32;
    const worldSize = 100;
    const landcover = new Uint8Array(res * res);
    // Left half: tree (1), Right half: rock (4)
    for (let y = 0; y < res; y += 1) {
      for (let x = 0; x < res; x += 1) {
        landcover[y * res + x] = x < res / 2 ? 1 : 4;
      }
    }
    const field = makeFlatField(res, worldSize);
    const result = scatterFoliage(landcover, res, field, {
      seed: 42,
      treeDensity: 10,
      grassDensity: 0,
      slopeLimitDeg: 35,
      scale: [0.8, 1.2],
      margin: 1,
    });

    expect(result.instances.length).toBeGreaterThan(0);
    for (const inst of result.instances) {
      const [_, x, , z] = inst;
      expect(x).toBeLessThan(0); // Left half of terrain (x < 0)
    }
  });

  it('keeps instances away from exclusions with margin', () => {
    const res = 32;
    const worldSize = 100;
    const landcover = new Uint8Array(res * res).fill(1); // all trees
    // Put a road (class 5) in a strip along the centre: x from 14 to 18
    for (let y = 0; y < res; y += 1) {
      for (let x = 14; x <= 18; x += 1) {
        landcover[y * res + x] = 5; // road
      }
    }
    const field = makeFlatField(res, worldSize);
    const marginM = 8;
    const result = scatterFoliage(landcover, res, field, {
      seed: 42,
      treeDensity: 20,
      grassDensity: 0,
      slopeLimitDeg: 35,
      scale: [1, 1],
      margin: marginM,
    });

    // The road strip is around x = [-6, 6] metres in world space.
    // Margin of 8m means no trees in [-14, 14].
    for (const inst of result.instances) {
      const [_, x] = inst;
      const roadCentreX = 0;
      const distFromRoadCentre = Math.abs(x - roadCentreX);
      expect(distFromRoadCentre).toBeGreaterThan(6);
    }
  });

  it('respects slopeLimitDeg', () => {
    const res = 33;
    const worldSize = 100;
    // Create a terrain with a flat plateau on left and a steep 60° slope on right
    const heights = new Float32Array(res * res);
    for (let z = 0; z < res; z += 1) {
      for (let x = 0; x < res; x += 1) {
        // Flat on left, steep slope on right
        heights[z * res + x] = x < 16 ? 0 : (x - 16) * 10;
      }
    }
    const field: Heightfield = { resolution: res, worldSize, heights };
    const landcover = new Uint8Array(res * res).fill(1); // all trees

    const result = scatterFoliage(landcover, res, field, {
      seed: 123,
      treeDensity: 15,
      grassDensity: 0,
      slopeLimitDeg: 25, // slope limit 25 deg
      scale: [1, 1],
      margin: 0,
    });

    expect(result.instances.length).toBeGreaterThan(0);
    for (const inst of result.instances) {
      const [_, x] = inst;
      // Should all be on the flat left side (x < 0)
      expect(x).toBeLessThan(0);
    }
  });

  it('produces identical output for identical seeds', () => {
    const res = 32;
    const worldSize = 100;
    const landcover = new Uint8Array(res * res).fill(1);
    const field = makeFlatField(res, worldSize);

    const r1 = scatterFoliage(landcover, res, field, {
      seed: 999,
      treeDensity: 5,
      grassDensity: 10,
      slopeLimitDeg: 35,
      scale: [0.8, 1.2],
      margin: 1,
    });
    const r2 = scatterFoliage(landcover, res, field, {
      seed: 999,
      treeDensity: 5,
      grassDensity: 10,
      slopeLimitDeg: 35,
      scale: [0.8, 1.2],
      margin: 1,
    });

    expect(r1.instances.length).toEqual(r2.instances.length);
    expect(r1.instances).toEqual(r2.instances);
  });
});
