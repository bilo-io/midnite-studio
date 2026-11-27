import { describe, expect, it } from 'vitest';

import { createHeightSampler, gridHeightAt, gridNormalAt, inGrid, raycastHeightfield, sampleGridAt } from './game-heightfield';

/** A seeded generator, so a failure replays. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hills = (resolution: number, seed = 7): Uint16Array => {
  const r = rng(seed);
  const out = new Uint16Array(resolution * resolution);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.floor(r() * 65536);
  return out;
};

describe('sampleGridAt', () => {
  it('splits a cell along the (i + 1, j)–(i, j + 1) diagonal, not bilinearly', () => {
    // One cell, only the far corner raised: bilinear gives 0.25 at the centre; the split's lower triangle gives 0.
    const values = [0, 0, 0, 1];
    expect(sampleGridAt(values, 2, 2, 0.5, 0.5)).toBe(0);
    expect(sampleGridAt(values, 2, 2, 0.75, 0.75)).toBeCloseTo(0.5, 12);
    expect(sampleGridAt(values, 2, 2, 1, 1)).toBe(1);
  });

  it('clamps a point off the grid to the nearest edge', () => {
    const values = [0, 10, 20, 30];
    expect(sampleGridAt(values, 2, 2, -5, 0)).toBe(0);
    expect(sampleGridAt(values, 2, 2, 9, 9)).toBe(30);
  });
});

describe('gridHeightAt / inGrid', () => {
  const g = { minX: -100, minZ: 0, maxX: 100, maxZ: 50, cols: 3, rows: 2, values: [0, 10, 20, 0, 10, 20] };
  it('reads world coordinates over an extent', () => {
    expect(gridHeightAt(g, 0, 25)).toBeCloseTo(10, 12);
    expect(gridHeightAt(g, 50, 10)).toBeCloseTo(15, 12);
    expect(inGrid(g, 100, 50)).toBe(true);
    expect(inGrid(g, 100.01, 50)).toBe(false);
  });
});

describe('createHeightSampler', () => {
  it('rejects a sample count that is not resolution²', () => {
    expect(() => createHeightSampler(new Uint16Array(5), { resolution: 3, worldSize: 10, heightRange: [0, 1] })).toThrow(/expected 3²/);
  });

  it('centres the terrain on its origin', () => {
    const s = createHeightSampler(hills(9), { resolution: 9, worldSize: 80, heightRange: [0, 100], origin: { x: 1000, z: -500 } });
    const plain = createHeightSampler(hills(9), { resolution: 9, worldSize: 80, heightRange: [0, 100] });
    expect(s.heightAt(1012.3, -507.1)).toBeCloseTo(plain.heightAt(12.3, -7.1), 9);
    expect(s.grid.minX).toBe(960);
    expect(s.cell).toBe(10);
  });

  it('B3: a flat field has the normal [0, 1, 0] everywhere', () => {
    const s = createHeightSampler(new Uint16Array(25).fill(30000), { resolution: 5, worldSize: 40, heightRange: [-10, 90] });
    for (const [x, z] of [[0, 0], [-19, 3.3], [7.7, 19.9], [500, 500]] as const) expect(s.normalAt(x, z)).toEqual([0, 1, 0]);
  });

  it('a normal leans away from the uphill side', () => {
    // Rising along +x by one metre per metre: the normal points back along −x at 45°.
    const res = 3, values = new Uint16Array(res * res);
    for (let j = 0; j < res; j += 1) for (let i = 0; i < res; i += 1) values[j * res + i] = Math.round((i / (res - 1)) * 65535);
    const s = createHeightSampler(values, { resolution: res, worldSize: 20, heightRange: [0, 20] });
    const [nx, ny, nz] = s.normalAt(3, -4);
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(ny).toBeCloseTo(Math.SQRT1_2, 4);
    expect(nz).toBeCloseTo(0, 6);
    expect(gridNormalAt(s.grid, 3, -4)).toEqual(s.normalAt(3, -4));
  });
});

describe('raycastHeightfield', () => {
  const s = createHeightSampler(hills(33, 3), { resolution: 33, worldSize: 320, heightRange: [0, 50] });

  it('B2: a ray from above hits within cell / 64 of heightAt at the hit', () => {
    const r = rng(11);
    for (let k = 0; k < 200; k += 1) {
      const origin: [number, number, number] = [(r() - 0.5) * 300, 200, (r() - 0.5) * 300];
      const dir: [number, number, number] = [(r() - 0.5) * 0.6, -1, (r() - 0.5) * 0.6];
      const hit = raycastHeightfield(s, origin, dir);
      expect(hit).not.toBeNull();
      const [x, y, z] = hit!;
      expect(Math.abs(y - s.heightAt(x, z))).toBeLessThan(s.cell / 64);
      // And the hit is on the ray.
      const t = (origin[1] - y) / 1;
      expect(Math.abs(x - (origin[0] + dir[0] * t))).toBeLessThan(s.cell / 8);
    }
  });

  it('a ray pointing up, or starting underground, returns null', () => {
    expect(raycastHeightfield(s, [0, 200, 0], [0.2, 1, 0])).toBeNull();
    expect(raycastHeightfield(s, [0, -10, 0], [0, -1, 0])).toBeNull();
  });

  it('a ray that never comes down within the distance returns null', () => {
    expect(raycastHeightfield(s, [0, 10_000, 0], [1, -0.001, 0], 1000)).toBeNull();
  });
});
