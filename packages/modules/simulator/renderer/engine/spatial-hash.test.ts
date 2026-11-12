import { describe, expect, it } from 'vitest';

import { mulberry32 } from './rng';
import { createSpatialHash } from './spatial-hash';

describe('spatial hash', () => {
  it('visits exactly the brute-force neighbour set for 500 random points', () => {
    const rand = mulberry32(7);
    const n = 500;
    const pos = new Float32Array(3 * n).map(() => rand() * 100);
    const hash = createSpatialHash(5, 100);
    hash.rebuild(pos, n);
    for (const radius of [3, 5, 12]) {
      for (let i = 0; i < n; i += 25) {
        const got: number[] = [];
        hash.forEachNear(i, radius, (j) => got.push(j));
        const want: number[] = [];
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const d2 = (pos[3 * j]! - pos[3 * i]!) ** 2 + (pos[3 * j + 1]! - pos[3 * i + 1]!) ** 2 + (pos[3 * j + 2]! - pos[3 * i + 2]!) ** 2;
          if (d2 <= radius * radius) want.push(j);
        }
        expect(got.sort((a, b) => a - b)).toEqual(want);
      }
    }
  });

  it('finds points outside the cube through the clamped edge cells and survives a rebuild with fewer points', () => {
    const hash = createSpatialHash(5, 20);
    hash.rebuild(new Float32Array([1, 1, 1, -3, 1, 1, 25, 1, 1]), 3);
    const got: number[] = [];
    hash.forEachNear(0, 5, (j) => got.push(j));
    expect(got).toEqual([1]);
    hash.rebuild(new Float32Array([1, 1, 1]), 1);
    hash.forEachNear(0, 5, () => got.push(-1));
    expect(got).toEqual([1]);
  });
});
