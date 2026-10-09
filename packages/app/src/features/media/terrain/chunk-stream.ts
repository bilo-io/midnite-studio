import { selectLod, TERRAIN_LOD_COUNT, type TerrainChunkInfo } from '@midnite/studio-shared';

/**
 * The viewer's chunk streaming rules, without WebGL (Phase 105 Theme D). A 4097² terrain is 1 024
 * chunks, each meshable at four LODs; meshing them all in one frame would stall, so the viewer asks
 * this module which few to mesh *next* (nearest first, at the LOD distance wants) and which cached LOD
 * to draw for each chunk in the meantime (the wanted one, else the next-coarser one already meshed).
 */
export const CHUNK_MESH_BUDGET = 4;

export type Vec3 = { x: number; y: number; z: number };
export type ChunkRequest = { cx: number; cz: number; lod: number; key: string };

export const chunkKey = (cx: number, cz: number, lod: number): string => `${cx},${cz},${lod}`;

const distanceTo = (camera: Vec3, chunk: TerrainChunkInfo): number =>
  Math.hypot(camera.x - chunk.centre[0], camera.y - chunk.centre[1], camera.z - chunk.centre[2]);

/** The LOD the camera's distance asks for, clamped to the LODs that exist. */
export const wantedLod = (camera: Vec3, chunk: TerrainChunkInfo, chunkSize: number, lodCount: number = TERRAIN_LOD_COUNT): number =>
  Math.min(lodCount - 1, selectLod(distanceTo(camera, chunk), chunkSize));

/**
 * Up to `budget` chunk meshes to build this frame: chunks whose wanted LOD is not cached yet, nearest
 * to the camera first.
 */
export function nextChunksToMesh(
  camera: Vec3,
  chunks: readonly TerrainChunkInfo[],
  cache: { has: (key: string) => boolean },
  budget: number = CHUNK_MESH_BUDGET,
  chunkSize: number,
  lodCount: number = TERRAIN_LOD_COUNT,
): ChunkRequest[] {
  const missing: Array<ChunkRequest & { distance: number }> = [];
  for (const chunk of chunks) {
    const distance = distanceTo(camera, chunk);
    const lod = Math.min(lodCount - 1, selectLod(distance, chunkSize));
    const key = chunkKey(chunk.cx, chunk.cz, lod);
    if (!cache.has(key)) missing.push({ cx: chunk.cx, cz: chunk.cz, lod, key, distance });
  }
  missing.sort((a, b) => a.distance - b.distance);
  return missing.slice(0, Math.max(0, budget)).map(({ distance: _distance, ...request }) => request);
}

/**
 * The LOD to draw for a chunk now: the wanted one when meshed, else the next-coarser cached one, else
 * (nothing coarser yet) a finer cached one, else `null` — the chunk is skipped until its mesh lands.
 */
export function lodToRender(
  camera: Vec3,
  chunk: TerrainChunkInfo,
  cache: { has: (key: string) => boolean },
  chunkSize: number,
  lodCount: number = TERRAIN_LOD_COUNT,
): number | null {
  const wanted = wantedLod(camera, chunk, chunkSize, lodCount);
  for (let lod = wanted; lod < lodCount; lod += 1) if (cache.has(chunkKey(chunk.cx, chunk.cz, lod))) return lod;
  for (let lod = wanted - 1; lod >= 0; lod -= 1) if (cache.has(chunkKey(chunk.cx, chunk.cz, lod))) return lod;
  return null;
}
