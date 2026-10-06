// @ts-check
/**
 * Midnite game kit — terrain chunk layout and LOD selection (engine-free).
 *
 * A re-implementation of Midnite Studio's terrain chunk rules (the Terrain
 * tab's `selectLod`/`chunkLayout`, with the same constants), so a game picks
 * the same level of detail for a chunk as the editor that exported it.
 */

export const TERRAIN_LOD_COUNT = 4;

/** Vertices per chunk side: 65 up to a 1025 grid, 129 above it. */
export const chunkVerts = (/** @type {number} */ resolution) => (resolution <= 1025 ? 65 : 129);

export const chunksPerSide = (/** @type {number} */ resolution) => (resolution - 1) / (chunkVerts(resolution) - 1);

/**
 * A chunk's side in world metres.
 * @param {number} resolution heightfield vertices per side (2ⁿ + 1)
 * @param {number} worldSize metres per side
 */
export const chunkWorldSize = (resolution, worldSize) => ((chunkVerts(resolution) - 1) * worldSize) / (resolution - 1);

/**
 * Distance bands, in chunk widths: LOD 0 below 1.5, 1 below 3, 2 below 6, else 3.
 * @param {number} distance metres from the camera to the chunk centre
 * @param {number} size `chunkWorldSize(...)`
 */
export function selectLod(distance, size) {
  const widths = distance / size;
  if (widths < 1.5) return 0;
  if (widths < 3) return 1;
  if (widths < 6) return 2;
  return 3;
}

/**
 * The ground-plane centre of chunk `(cx, cz)`; world coordinates are centred
 * on the origin, `cz` rows run along +z.
 * @param {number} cx
 * @param {number} cz
 * @param {number} resolution
 * @param {number} worldSize
 * @returns {[number, number]} `[x, z]`
 */
export function chunkCentre(cx, cz, resolution, worldSize) {
  const size = chunkWorldSize(resolution, worldSize);
  const half = worldSize / 2;
  return [-half + (cx + 0.5) * size, -half + (cz + 0.5) * size];
}

/** `chunk_<cx>_<cz>` → `{ cx, cz }`, or null for any other node name. */
export function parseChunkName(/** @type {string} */ name) {
  const match = /^chunk_(\d+)_(\d+)$/.exec(name);
  return match ? { cx: Number(match[1]), cz: Number(match[2]) } : null;
}
