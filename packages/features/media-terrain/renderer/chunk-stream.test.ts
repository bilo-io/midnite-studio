import type { TerrainChunkInfo } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { CHUNK_MESH_BUDGET, chunkKey, lodToRender, nextChunksToMesh } from './chunk-stream';

/** A 4 × 4 grid of 100 m chunks centred on the origin, at y = 0. */
const SIZE = 100;
const chunks: TerrainChunkInfo[] = [];
for (let cz = 0; cz < 4; cz += 1) {
  for (let cx = 0; cx < 4; cx += 1) {
    chunks.push({ cx, cz, minY: 0, maxY: 0, centre: [-150 + cx * SIZE, 0, -150 + cz * SIZE], radius: 70 });
  }
}
const at = (cx: number, cz: number) => chunks.find((c) => c.cx === cx && c.cz === cz)!;

describe('nextChunksToMesh', () => {
  const camera = { x: -150, y: 0, z: -150 }; // above chunk (0, 0)

  it('meshes the nearest chunks first', () => {
    const next = nextChunksToMesh(camera, chunks, new Set<string>(), 3, SIZE);
    expect(next.map((r) => [r.cx, r.cz])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  it('never returns more than the budget (4 by default)', () => {
    expect(CHUNK_MESH_BUDGET).toBe(4);
    expect(nextChunksToMesh(camera, chunks, new Set<string>(), undefined, SIZE)).toHaveLength(4);
    expect(nextChunksToMesh(camera, chunks, new Set<string>(), 0, SIZE)).toHaveLength(0);
  });

  it('asks for the LOD the distance wants, and skips what is cached', () => {
    const [first] = nextChunksToMesh(camera, chunks, new Set<string>(), 1, SIZE);
    expect(first).toMatchObject({ cx: 0, cz: 0, lod: 0, key: '0,0,0' });
    const far = nextChunksToMesh(camera, [at(3, 3)], new Set<string>(), 1, SIZE)[0]!;
    expect(far.lod).toBeGreaterThan(0);
    const cache = new Set<string>(['0,0,0']);
    expect(nextChunksToMesh(camera, chunks, cache, 1, SIZE)[0]).toMatchObject({ cx: 1, cz: 0 });
  });

  it('is empty once every wanted mesh is cached', () => {
    const all = new Set<string>();
    for (const r of nextChunksToMesh(camera, chunks, all, 99, SIZE)) all.add(r.key);
    expect(nextChunksToMesh(camera, chunks, all, 99, SIZE)).toEqual([]);
  });
});

describe('lodToRender', () => {
  const camera = { x: -150, y: 0, z: -150 };
  const chunk = at(0, 0); // wants LOD 0

  it('draws the wanted LOD when it is meshed', () => {
    expect(lodToRender(camera, chunk, new Set([chunkKey(0, 0, 0), chunkKey(0, 0, 2)]), SIZE)).toBe(0);
  });

  it('falls back to the next-coarser cached LOD while the wanted one is not ready', () => {
    expect(lodToRender(camera, chunk, new Set([chunkKey(0, 0, 2), chunkKey(0, 0, 3)]), SIZE)).toBe(2);
  });

  it('falls back to a finer one when nothing coarser exists, and to null when nothing is cached', () => {
    const far = at(3, 3);
    const wanted = lodToRender(camera, far, new Set([chunkKey(3, 3, 0)]), SIZE);
    expect(wanted).toBe(0);
    expect(lodToRender(camera, far, new Set<string>(), SIZE)).toBeNull();
  });
});
