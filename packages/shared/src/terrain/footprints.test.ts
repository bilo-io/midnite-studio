import { describe, expect, it } from 'vitest';

import { extractFootprints } from './footprints';
import type { Heightfield } from './heightfield';

function makeFlatField(res = 65, worldSize = 200, height = 15): Heightfield {
  return {
    resolution: res,
    worldSize,
    heights: new Float32Array(res * res).fill(height),
  };
}

describe('extractFootprints', () => {
  it('extracts a 20x20 px square into 4 corners', () => {
    const res = 64;
    const worldSize = 200;
    const landcover = new Uint8Array(res * res);
    // Draw 20x20 building square (class 6)
    for (let y = 20; y < 40; y += 1) {
      for (let x = 20; x < 40; x += 1) {
        landcover[y * res + x] = 6;
      }
    }
    const field = makeFlatField(res, worldSize);
    const result = extractFootprints(landcover, res, worldSize, field, {
      seed: 1,
      height: [4, 18],
      scaleByArea: true,
      minAreaM2: 20,
      snapToleranceDeg: 12,
      flattenBlendM: 3,
    });

    expect(result.buildings.length).toBe(1);
    const b = result.buildings[0]!;
    expect(b.polygon.length).toBe(4);
    expect(b.baseY).toBeCloseTo(15, 1);
    expect(b.height).toBeGreaterThanOrEqual(4 * 0.75);
    expect(b.height).toBeLessThanOrEqual(18 * 1.5);
  });

  it('snaps a square rotated 10° with a 2 px notch into 4 corners', () => {
    const res = 128;
    const worldSize = 200;
    const landcover = new Uint8Array(res * res);

    // Centre of square at (64, 64), half-size 15, rotated by 10 deg
    const cx = 64;
    const cy = 64;
    const half = 15;
    const theta = (10 * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    for (let y = 30; y < 100; y += 1) {
      for (let x = 30; x < 100; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const rx = dx * cosT + dy * sinT;
        const ry = -dx * sinT + dy * cosT;

        if (Math.abs(rx) <= half && Math.abs(ry) <= half) {
          // Add a 2 px notch along one edge
          if (rx > half - 2 && Math.abs(ry) < 4) {
            continue; // notch
          }
          landcover[y * res + x] = 6;
        }
      }
    }

    const field = makeFlatField(res, worldSize);
    const result = extractFootprints(landcover, res, worldSize, field, {
      seed: 2,
      height: [5, 10],
      scaleByArea: false,
      minAreaM2: 20,
      snapToleranceDeg: 15,
      flattenBlendM: 3,
    });

    expect(result.buildings.length).toBe(1);
    const b = result.buildings[0]!;
    expect(b.polygon.length).toBe(4);
  });

  it('drops small specks / 3 px blobs below minAreaM2', () => {
    const res = 64;
    const worldSize = 200; // 200m / 64 ≈ 3.125m/px, 1 px² ≈ 9.76 m²
    const landcover = new Uint8Array(res * res);
    // Draw 3 pixels
    landcover[10 * res + 10] = 6;
    landcover[10 * res + 11] = 6;
    landcover[11 * res + 10] = 6;

    const field = makeFlatField(res, worldSize);
    const result = extractFootprints(landcover, res, worldSize, field, {
      seed: 3,
      height: [4, 18],
      scaleByArea: true,
      minAreaM2: 50, // threshold higher than 3 px
      snapToleranceDeg: 12,
      flattenBlendM: 3,
    });

    expect(result.buildings.length).toBe(0);
  });
});
