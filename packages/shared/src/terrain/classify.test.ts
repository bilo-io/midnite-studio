import { describe, expect, it } from 'vitest';

import { TERRAIN_CLASS_INDICES } from './classes';
import { classify } from './classify';
import type { Heightfield } from './heightfield';
import type { RasterImage } from './raster';

describe('land-cover classification', () => {
  it('classifies a 64² fixture of four patches to tree/grass/water/rock with >= 95% accuracy', () => {
    const W = 64;
    const H = 64;
    const rgba = new Uint8Array(W * H * 4);

    // Heightfield with 65x65 resolution, world size 64m (1m per vertex)
    const fRes = 65;
    const heights = new Float32Array(fRes * fRes);

    // Fill heights:
    // - Quadrant 0 (top-left, x < 32, y < 32): height 100, flat terrain
    // - Quadrant 1 (top-right, x >= 32, y < 32): height 100, flat terrain
    // - Quadrant 2 (bottom-left, x < 32, y >= 32): height 20 (below sea level 50), flat terrain
    // - Quadrant 3 (bottom-right, x >= 32, y >= 32): 45-degree slope (dy/dx = 1)
    for (let z = 0; z < fRes; z += 1) {
      for (let x = 0; x < fRes; x += 1) {
        let h = 100;
        if (x < 32 && z >= 32) {
          h = 20; // below seaLevel
        } else if (x >= 32 && z >= 32) {
          // 45 degree slope: 1 meter rise per 1 meter run
          h = 100 + (x - 32) * 1.0;
        }
        heights[z * fRes + x] = h;
      }
    }

    const field: Heightfield = {
      resolution: fRes,
      worldSize: 64,
      heights,
    };

    // Color definitions
    // Tree: #2d6a4f (45, 106, 79)
    // Grass: #95d5b2 (149, 213, 178)
    // Water: #3a7bd5 (58, 123, 213)
    // Rock: #8d99ae (141, 153, 174)

    let noiseSeed = 123;
    const noiseRng = () => {
      noiseSeed = (noiseSeed * 16807) % 2147483647;
      return (noiseSeed - 1) / 2147483646;
    };

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const idx = (y * W + x) * 4;
        if (x < 32 && y < 32) {
          // Top-left: Tree with high-frequency noise for variance > 0.004
          const n = (noiseRng() - 0.5) * 100;
          rgba[idx] = Math.max(0, Math.min(255, 45 + n));
          rgba[idx + 1] = Math.max(0, Math.min(255, 106 + n));
          rgba[idx + 2] = Math.max(0, Math.min(255, 79 + n));
          rgba[idx + 3] = 255;
        } else if (x >= 32 && y < 32) {
          // Top-right: Grass (smooth, flat)
          rgba[idx] = 149;
          rgba[idx + 1] = 213;
          rgba[idx + 2] = 178;
          rgba[idx + 3] = 255;
        } else if (x < 32 && y >= 32) {
          // Bottom-left: Water
          rgba[idx] = 58;
          rgba[idx + 1] = 123;
          rgba[idx + 2] = 213;
          rgba[idx + 3] = 255;
        } else {
          // Bottom-right: Rock
          rgba[idx] = 141;
          rgba[idx + 1] = 153;
          rgba[idx + 2] = 174;
          rgba[idx + 3] = 255;
        }
      }
    }

    const drape: RasterImage = {
      width: W,
      height: H,
      channels: 4,
      bitDepth: 8,
      data: rgba,
    };

    const res = classify(drape, field, {
      seaLevel: 50,
      rockSlopeDeg: 35,
      exgThreshold: 0.05,
      seed: 42,
    });

    const expectedTree = TERRAIN_CLASS_INDICES.tree;
    const expectedGrass = TERRAIN_CLASS_INDICES.grass;
    const expectedWater = TERRAIN_CLASS_INDICES.water;
    const expectedRock = TERRAIN_CLASS_INDICES.rock;

    // Check inner 24x24 core of each 32x32 quadrant to avoid boundary 7x7 filter overlap
    let treeCorrect = 0;
    let grassCorrect = 0;
    let waterCorrect = 0;
    let rockCorrect = 0;
    let totalSamplesPerQuad = 0;

    for (let dy = 4; dy < 28; dy += 1) {
      for (let dx = 4; dx < 28; dx += 1) {
        totalSamplesPerQuad += 1;
        if (res.classes[dy * W + dx] === expectedTree) treeCorrect += 1;
        if (res.classes[dy * W + (32 + dx)] === expectedGrass) grassCorrect += 1;
        if (res.classes[(32 + dy) * W + dx] === expectedWater) waterCorrect += 1;
        if (res.classes[(32 + dy) * W + (32 + dx)] === expectedRock) rockCorrect += 1;
      }
    }

    const treeAcc = treeCorrect / totalSamplesPerQuad;
    const grassAcc = grassCorrect / totalSamplesPerQuad;
    const waterAcc = waterCorrect / totalSamplesPerQuad;
    const rockAcc = rockCorrect / totalSamplesPerQuad;

    expect(treeAcc).toBeGreaterThanOrEqual(0.95);
    expect(grassAcc).toBeGreaterThanOrEqual(0.95);
    expect(waterAcc).toBeGreaterThanOrEqual(0.95);
    expect(rockAcc).toBeGreaterThanOrEqual(0.95);

    // Determinism test: same seed gives identical output
    const res2 = classify(drape, field, {
      seaLevel: 50,
      rockSlopeDeg: 35,
      exgThreshold: 0.05,
      seed: 42,
    });
    expect(res.classes).toEqual(res2.classes);
  });

  it('respects paint overrides', () => {
    const W = 16;
    const H = 16;
    const drape: RasterImage = {
      width: W,
      height: H,
      channels: 4,
      bitDepth: 8,
      data: new Uint8Array(W * H * 4).fill(255),
    };
    const field: Heightfield = {
      resolution: 17,
      worldSize: 16,
      heights: new Float32Array(17 * 17),
    };

    // Override pixel (0, 0) to class road (index 5 -> override value 6)
    const overrides = new Uint8Array(W * H);
    overrides[0] = TERRAIN_CLASS_INDICES.road + 1;

    const res = classify(drape, field, { overrides });
    expect(res.classes[0]).toBe(TERRAIN_CLASS_INDICES.road);
  });
});
