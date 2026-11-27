/**
 * The one terrain height sampler the editor, main and the MCP tools share (Phase 141 Theme B). It interpolates
 * exactly as the kit's `createHeightfield().heightAt` (`templates/media-game/kit/core/heightfield.js`) does: each
 * grid cell is two triangles split along the diagonal from `(i + 1, j)` to `(i, j + 1)`, Rapier's split, so a prop
 * the editor stands on the ground is where the game's physics stands it. `heightfield-agreement.test.ts` runs both.
 * Pure: no DOM, no node.
 */

type V3 = [number, number, number];

/** A height grid laid over a world rectangle: `cols × rows` vertices, row-major by z, edge to edge. */
export type HeightGrid = { minX: number; minZ: number; maxX: number; maxZ: number; cols: number; rows: number; values: ArrayLike<number> };

/** The kit's `heightfield.json`, plus where the terrain's centre stands in the world (the kit's `origin: 'centre'`). */
export type GameHeightfieldInfo = { resolution: number; worldSize: number; heightRange: readonly [number, number] | readonly number[]; origin?: { x: number; z: number } };

/**
 * A grid's value at fractional vertex coordinates `(fx, fz)`, clamped to the grid: the kit's triangle split. The
 * grid must be at least 2 × 2.
 */
export function sampleGridAt(values: ArrayLike<number>, cols: number, rows: number, fx: number, fz: number): number {
  const lastX = cols - 1, lastZ = rows - 1;
  const cx = Math.min(lastX, Math.max(0, fx)), cz = Math.min(lastZ, Math.max(0, fz));
  const i = Math.min(lastX - 1, Math.floor(cx)), j = Math.min(lastZ - 1, Math.floor(cz));
  const u = cx - i, v = cz - j;
  const at = (a: number, b: number): number => (values[b * cols + a] as number | undefined) ?? 0;
  if (u + v <= 1) return at(i, j) + u * (at(i + 1, j) - at(i, j)) + v * (at(i, j + 1) - at(i, j));
  const h11 = at(i + 1, j + 1);
  return h11 + (1 - u) * (at(i, j + 1) - h11) + (1 - v) * (at(i + 1, j) - h11);
}

/** `grid`'s fractional vertex coordinates at world `(x, z)`. */
const gridCoords = (g: HeightGrid, x: number, z: number): [number, number] => [((x - g.minX) / (g.maxX - g.minX)) * (g.cols - 1), ((z - g.minZ) / (g.maxZ - g.minZ)) * (g.rows - 1)];

/** Whether world `(x, z)` lies on the grid's rectangle (edges included). */
export const inGrid = (g: Pick<HeightGrid, 'minX' | 'minZ' | 'maxX' | 'maxZ'>, x: number, z: number): boolean => x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ;

/** The grid's value at world `(x, z)`; a point off the grid reads its nearest edge (the kit's clamp). */
export function gridHeightAt(g: HeightGrid, x: number, z: number): number {
  const [fx, fz] = gridCoords(g, x, z);
  return sampleGridAt(g.values, g.cols, g.rows, fx, fz);
}

/**
 * The upward unit normal of the triangle under world `(x, z)` (the same triangle {@link gridHeightAt} reads), so a
 * flat field answers `[0, 1, 0]` exactly. `scale` turns the grid's values into metres when they are raw samples (an
 * offset does not change a slope).
 */
export function gridNormalAt(g: HeightGrid, x: number, z: number, scale = 1): V3 {
  const dx = (g.maxX - g.minX) / (g.cols - 1), dz = (g.maxZ - g.minZ) / (g.rows - 1);
  const [fx0, fz0] = gridCoords(g, x, z);
  const fx = Math.min(g.cols - 1, Math.max(0, fx0)), fz = Math.min(g.rows - 1, Math.max(0, fz0));
  const i = Math.min(g.cols - 2, Math.floor(fx)), j = Math.min(g.rows - 2, Math.floor(fz));
  const at = (a: number, b: number): number => ((g.values[b * g.cols + a] as number | undefined) ?? 0) * scale;
  let sx: number, sz: number;
  if (fx - i + (fz - j) <= 1) {
    sx = (at(i + 1, j) - at(i, j)) / dx;
    sz = (at(i, j + 1) - at(i, j)) / dz;
  } else {
    sx = (at(i + 1, j + 1) - at(i, j + 1)) / dx;
    sz = (at(i + 1, j + 1) - at(i + 1, j)) / dz;
  }
  const len = Math.hypot(sx, 1, sz);
  // `+ 0` turns a `-0` into `0`, so a flat field compares equal to `[0, 1, 0]`.
  return [-sx / len + 0, 1 / len, -sz / len + 0];
}

export type HeightSampler = {
  info: GameHeightfieldInfo;
  /** The grid in world metres, for callers that walk it (a mesh, a hillshade). */
  grid: HeightGrid;
  /** Metres at world `(x, z)`, clamped to the edge off the terrain. */
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): V3;
  /** Metres between vertices. */
  cell: number;
};

/**
 * A terrain pack's heightfield as metres, sampled as the kit samples it: `samples` are the PNG's 16-bit values
 * (`resolution²`, row-major by z), `info` its `heightfield.json`. The terrain is centred on `info.origin` (0, 0 by
 * default). Throws when the sample count does not match, as the kit does.
 */
export function createHeightSampler(samples: ArrayLike<number>, info: GameHeightfieldInfo): HeightSampler {
  const { resolution, worldSize } = info;
  const [min = 0, max = 0] = info.heightRange;
  if (samples.length !== resolution * resolution) throw new Error(`Heightfield has ${samples.length} samples; expected ${resolution}².`);
  const span = max - min;
  // Float32, as the kit stores its heights, so the two agree to the last bit the kit keeps.
  const heights = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) heights[i] = min + ((samples[i] ?? 0) / 65535) * span;
  const half = worldSize / 2, ox = info.origin?.x ?? 0, oz = info.origin?.z ?? 0;
  const grid: HeightGrid = { minX: ox - half, minZ: oz - half, maxX: ox + half, maxZ: oz + half, cols: resolution, rows: resolution, values: heights };
  const cell = worldSize / (resolution - 1);
  return {
    info,
    grid,
    cell,
    // The kit's own arithmetic (`(x + half) / cell`), not `gridCoords`' fraction of the extent, so rounding matches too.
    heightAt: (x, z) => sampleGridAt(heights, resolution, resolution, (x - ox + half) / cell, (z - oz + half) / cell),
    normalAt: (x, z) => gridNormalAt(grid, x, z),
  };
}

/**
 * Where a ray first meets the sampler's ground: marched in half-cell steps, then narrowed by bisection. `null` when
 * it starts under the ground, points up from above it, or does not come down within `maxDistance` metres.
 */
export function raycastHeightfield(s: Pick<HeightSampler, 'heightAt' | 'cell'>, origin: V3, dir: V3, maxDistance = 100_000): V3 | null {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (!(len > 0)) return null;
  const d: V3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  const above = (t: number): number => origin[1] + d[1] * t - s.heightAt(origin[0] + d[0] * t, origin[2] + d[2] * t);
  if (above(0) < 0) return null;
  if (d[1] >= 0) return null;
  const step = Math.max(1e-6, s.cell / 2);
  let prev = 0;
  for (let t = step; prev < maxDistance; t += step) {
    const at = Math.min(t, maxDistance);
    if (above(at) <= 0) {
      let lo = prev, hi = at;
      for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      const x = origin[0] + d[0] * hi, z = origin[2] + d[2] * hi;
      return [x, s.heightAt(x, z), z];
    }
    prev = at;
  }
  return null;
}
