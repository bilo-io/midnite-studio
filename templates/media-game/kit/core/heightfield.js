// @ts-check
/**
 * Midnite game kit — the terrain heightfield in world units (engine-free).
 *
 * A terrain pack stores heights as a 16-bit PNG (`round((h − min) / (max − min)
 * × 65535)`) beside `heightfield.json`. This turns that back into metres,
 * answers `heightAt(x, z)` for gameplay (spawning on the ground, foliage
 * placement, AI) and lays the samples out the way Rapier's heightfield
 * collider wants them.
 *
 * World coordinates are centred on the origin: sample `(i, j)` (column `i`
 * along +x, row `j` along +z) sits at `x = −worldSize/2 + i × cell`.
 */

/**
 * @typedef {{
 *   resolution: number,
 *   worldSize: number,
 *   heightRange: [number, number],
 *   heights: Float32Array,
 *   cell: number,
 *   heightAt: (x: number, z: number) => number,
 * }} Heightfield
 */

/**
 * @param {Uint16Array} samples `resolution²` quantised heights, row-major by z
 * @param {{ resolution: number, worldSize: number, heightRange: readonly [number, number] | number[] }} info
 * @returns {Heightfield}
 */
export function createHeightfield(samples, info) {
  const { resolution, worldSize } = info;
  const [min = 0, max = 0] = info.heightRange;
  if (samples.length !== resolution * resolution) {
    throw new Error(`Heightfield has ${samples.length} samples; expected ${resolution}².`);
  }
  const span = max - min;
  const heights = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) heights[i] = min + ((samples[i] ?? 0) / 65535) * span;
  const cell = worldSize / (resolution - 1);
  const half = worldSize / 2;
  const last = resolution - 1;

  /** @param {number} i @param {number} j */
  const at = (i, j) => heights[j * resolution + i] ?? 0;

  return {
    resolution,
    worldSize,
    heightRange: [min, max],
    heights,
    cell,
    /**
     * Height in metres at world `(x, z)`, clamped to the edge outside the
     * terrain. Each cell is split into two triangles along the diagonal from
     * `(i + 1, j)` to `(i, j + 1)` — the same split as Rapier's heightfield
     * collider, so a character placed at `heightAt` stands exactly on it.
     */
    heightAt(x, z) {
      const fx = Math.min(last, Math.max(0, (x + half) / cell));
      const fz = Math.min(last, Math.max(0, (z + half) / cell));
      const i = Math.min(last - 1, Math.floor(fx));
      const j = Math.min(last - 1, Math.floor(fz));
      const u = fx - i;
      const v = fz - j;
      if (u + v <= 1) return at(i, j) + u * (at(i + 1, j) - at(i, j)) + v * (at(i, j + 1) - at(i, j));
      const h11 = at(i + 1, j + 1);
      return h11 + (1 - u) * (at(i, j + 1) - h11) + (1 - v) * (at(i + 1, j) - h11);
    },
  };
}

/**
 * Rapier's `ColliderDesc.heightfield(nrows, ncols, heights, scale)` reads a
 * column-major matrix whose rows run along z and columns along x — the
 * transpose of the PNG's row-major-by-z order. Pass `resolution − 1` for both
 * `nrows` and `ncols`, and `{ x: worldSize, y: 1, z: worldSize }` as the scale
 * (heights are already metres).
 * @param {Float32Array} heights row-major by z
 * @param {number} resolution
 */
export function toRapierHeights(heights, resolution) {
  const out = new Float32Array(heights.length);
  for (let j = 0; j < resolution; j += 1) {
    for (let i = 0; i < resolution; i += 1) out[i * resolution + j] = heights[j * resolution + i] ?? 0;
  }
  return out;
}

/** Quantise metres back to the PNG's 16-bit samples (the exporter's rule). */
export function quantiseHeights(/** @type {ArrayLike<number>} */ heights, /** @type {readonly number[]} */ heightRange) {
  const [min = 0, max = 0] = heightRange;
  const span = max - min || 1;
  const out = new Uint16Array(heights.length);
  for (let i = 0; i < heights.length; i += 1) {
    out[i] = Math.round(Math.min(1, Math.max(0, ((heights[i] ?? 0) - min) / span)) * 65535);
  }
  return out;
}
