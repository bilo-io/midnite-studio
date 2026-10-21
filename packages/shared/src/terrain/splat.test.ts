import { describe, expect, it } from 'vitest';

import { TERRAIN_CLASS_INDICES } from './classes';
import type { Heightfield } from './heightfield';
import { computeSplatWeights, generateSplatMap } from './splat';

describe('splat map and weights', () => {
  const heightRange: [number, number] = [0, 200];
  const snowLineM = 170;

  it("every texel's four weights sum to 1 ± 1e-6", () => {
    const classes = Object.values(TERRAIN_CLASS_INDICES);
    const heights = [0, 50, 100, 150, 160, 165, 170, 180, 200];
    const slopes = [0, 10, 25, 30, 35, 45, 60];

    for (const cls of classes) {
      for (const h of heights) {
        for (const s of slopes) {
          const [r, g, b, a] = computeSplatWeights(cls, h, s, {
            rockSlopeDeg: 35,
            heightRange,
            snowLineM,
          });

          const sum = r + g + b + a;
          expect(sum).toBeCloseTo(1, 6);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(g).toBeGreaterThanOrEqual(0);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(a).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('snow is 0 below snowLine - 10 and 1 above snowLine', () => {
    // For non-water classes
    const cls = TERRAIN_CLASS_INDICES.grass;

    // Below snowLine - 10 (160m)
    const below = computeSplatWeights(cls, 159, 10, {
      rockSlopeDeg: 35,
      heightRange,
      snowLineM,
    });
    expect(below[3]).toBe(0);

    // At snowLine - 10
    const edge = computeSplatWeights(cls, 160, 10, {
      rockSlopeDeg: 35,
      heightRange,
      snowLineM,
    });
    expect(edge[3]).toBe(0);

    // Above snowLine (170m)
    const above = computeSplatWeights(cls, 170, 10, {
      rockSlopeDeg: 35,
      heightRange,
      snowLineM,
    });
    expect(above[3]).toBe(1);
    expect(above[0]).toBe(0);
    expect(above[1]).toBe(0);
    expect(above[2]).toBe(0);

    const wayAbove = computeSplatWeights(cls, 190, 45, {
      rockSlopeDeg: 35,
      heightRange,
      snowLineM,
    });
    expect(wayAbove[3]).toBe(1);
  });

  it('generates a full splat map RGBA buffer', () => {
    const classRes = 16;
    const outRes = 32;
    const classes = new Uint8Array(classRes * classRes).fill(TERRAIN_CLASS_INDICES.grass);
    const field: Heightfield = {
      resolution: 17,
      worldSize: 100,
      heights: new Float32Array(17 * 17).fill(50),
    };

    const map = generateSplatMap(classes, classRes, field, outRes, {
      heightRange: [0, 100],
      rockSlopeDeg: 35,
    });

    expect(map.length).toBe(outRes * outRes * 4);
    // At height 50 with slope 0 on grass, R (grass) should be dominant
    expect(map[0]).toBeGreaterThan(200);
    expect(map[1]).toBe(0);
  });
});
