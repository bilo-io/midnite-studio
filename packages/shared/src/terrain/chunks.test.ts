import { describe, expect, it } from 'vitest';

import { chunkLayout, chunkMesh, chunksPerSide, chunkVerts, chunkWorldSize, selectLod, TERRAIN_LOD_COUNT } from './chunks';
import type { Heightfield } from './heightfield';

const bumpy = (res: number, worldSize = res - 1): Heightfield => {
  const heights = new Float32Array(res * res);
  for (let z = 0; z < res; z += 1) {
    for (let x = 0; x < res; x += 1) heights[z * res + x] = Math.sin(x * 0.37) * 5 + Math.cos(z * 0.21) * 4 + x * 0.01;
  }
  return { resolution: res, worldSize, heights };
};

describe('chunk rules', () => {
  it('picks 65 vertices up to 1025 and 129 above', () => {
    expect(chunkVerts(129)).toBe(65);
    expect(chunkVerts(1025)).toBe(65);
    expect(chunkVerts(2049)).toBe(129);
    expect(chunkVerts(4097)).toBe(129);
    expect(chunksPerSide(513)).toBe(8);
    expect(chunksPerSide(129)).toBe(2);
    expect(TERRAIN_LOD_COUNT).toBe(4);
  });

  it('selects LOD by chunk widths with the documented boundaries', () => {
    const w = 100;
    expect(selectLod(0, w)).toBe(0);
    expect(selectLod(149.9, w)).toBe(0);
    expect(selectLod(150, w)).toBe(1);
    expect(selectLod(299.9, w)).toBe(1);
    expect(selectLod(300, w)).toBe(2);
    expect(selectLod(599.9, w)).toBe(2);
    expect(selectLod(600, w)).toBe(3);
  });
});

describe('chunkLayout', () => {
  it('covers the terrain with bounds that contain the chunk heights', () => {
    const f = bumpy(129, 256);
    const chunks = chunkLayout(f);
    expect(chunks).toHaveLength(4);
    expect(chunkWorldSize(f)).toBe(128);
    for (const c of chunks) {
      expect(c.maxY).toBeGreaterThanOrEqual(c.minY);
      expect(c.radius).toBeGreaterThan(64);
    }
    expect(chunks[0]!.centre[0]).toBeCloseTo(-64, 6);
    expect(chunks[3]!.centre[0]).toBeCloseTo(64, 6);
  });
});

describe('chunkMesh', () => {
  const f = bumpy(129, 128);
  /** Heights along one vertical edge of a chunk, keyed by world z. */
  const edgeHeights = (lod: number, cx: number, cz: number, side: 'east' | 'west') => {
    const mesh = chunkMesh(f, cx, cz, lod);
    const n = 64 / 2 ** lod + 1;
    const out = new Map<number, number>();
    for (let j = 0; j < n; j += 1) {
      const slot = j * n + (side === 'east' ? n - 1 : 0);
      out.set(mesh.positions[slot * 3 + 2]!, mesh.positions[slot * 3 + 1]!);
    }
    return out;
  };

  it('shares edge heights between neighbours at every LOD pair (no cracks)', () => {
    for (let a = 0; a < TERRAIN_LOD_COUNT; a += 1) {
      for (let b = 0; b < TERRAIN_LOD_COUNT; b += 1) {
        const left = edgeHeights(a, 0, 0, 'east');
        const right = edgeHeights(b, 1, 0, 'west');
        const [coarse, fine] = left.size <= right.size ? [left, right] : [right, left];
        for (const [z, y] of coarse) expect(fine.get(z)).toBeCloseTo(y, 6);
      }
    }
  });

  it('has the expected vertex and index counts and in-range indices', () => {
    for (let lod = 0; lod < TERRAIN_LOD_COUNT; lod += 1) {
      const mesh = chunkMesh(f, 0, 0, lod);
      const n = 64 / 2 ** lod + 1;
      expect(mesh.positions.length / 3).toBe(n * n + n * 4);
      expect(mesh.indices.length).toBe((n - 1) * (n - 1) * 6 + (n - 1) * 4 * 6);
      expect(mesh.indices.reduce((m, i) => Math.max(m, i), 0)).toBeLessThan(mesh.positions.length / 3);
    }
  });

  it('keeps UVs in [0, 1] of the whole terrain and centres positions on the origin', () => {
    const mesh = chunkMesh(f, 1, 1, 0);
    expect(mesh.uvs.reduce((m, v) => Math.min(m, v), 1)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(mesh.uvs.reduce((m, v) => Math.max(m, v), 0)).toBeLessThanOrEqual(1);
    expect(mesh.positions[0]).toBeCloseTo(0, 6);
  });

  it('drops a skirt below each edge, wound outward', () => {
    const mesh = chunkMesh(f, 0, 0, 3, [0, 100]);
    const n = 64 / 8 + 1;
    expect(mesh.positions[n * n * 3 + 1]).toBeCloseTo(mesh.positions[1]! - 2, 5);
    // The first north-skirt triangle must face -z.
    const base = (n - 1) * (n - 1) * 6;
    const tri = [mesh.indices[base]!, mesh.indices[base + 1]!, mesh.indices[base + 2]!];
    const p = (i: number) => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!] as const;
    const [a, b, c] = [p(tri[0]!), p(tri[1]!), p(tri[2]!)];
    const e1 = [b[0] - a[0], b[1] - a[1]] as const;
    const e2 = [c[0] - a[0], c[1] - a[1]] as const;
    expect(e1[0] * e2[1] - e1[1] * e2[0]).toBeLessThan(0);
  });
});
