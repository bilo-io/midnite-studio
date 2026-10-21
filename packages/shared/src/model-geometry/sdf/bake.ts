import { SDF_RESOLUTION_DEFAULT, SDF_RESOLUTION_MAX, SDF_RESOLUTION_MIN, type SdfTree } from '../../media-model-sdf';
import { surfaceNets } from '../mesh/surface-nets';
import { compileSdf, type CompiledSdf } from './evaluate';

/**
 * Baking a signed-distance tree into a mesh (Phase 104 Theme C).
 *
 * The field is sampled on a regular grid sized from the tree's bounds, then {@link surfaceNets} extracts
 * the zero isosurface — the same extractor Theme B's voxel remesh uses, so the result is closed and its
 * every edge is shared by two triangles. Sampling is **sparse**: the grid is walked as an octree of blocks
 * (32³ nodes down to 4³), the field is evaluated once at each block's centre, and a block whose centre is farther from the
 * surface than the block's half-diagonal (plus one and a half voxels), scaled by the tree's Lipschitz
 * bound, cannot contain or touch the surface — so its nodes are filled with a safe same-signed value
 * instead of being evaluated; any other block splits in eight. Only the thin shell of blocks the surface passes through is sampled in
 * full, which keeps a 256³ field to a few million evaluations instead of seventeen million.
 *
 * Each output vertex is assigned to the primitive whose own surface is nearest it, so every leaf of the
 * tree becomes a vertex group carrying its colour.
 */

export type SdfBakeOptions = {
  /** Grid nodes − 1 along the longest side of the bounds (16–256, default 96). */
  resolution?: number;
  /** Disable block pruning — every node evaluated (tests compare the two). */
  dense?: boolean;
};

export type SdfBakeResult = {
  positions: Float32Array;
  indices: Uint32Array;
  /** One group per vertex: an index into `groupTable`. */
  groups: Uint16Array;
  /** One entry per primitive leaf, depth first. */
  groupTable: { name: string; color: string }[];
  voxelSize: number;
  dims: [number, number, number];
  resolution: number;
  /** Field evaluations made, and grid nodes filled without one — the pruning's effect. */
  evaluated: number;
  skipped: number;
};

export class SdfBakeError extends Error {
  override readonly name = 'SdfBakeError';
}

/** Top-level block edge (nodes); blocks that may hold the surface split in eight down to {@link LEAF_NODES}. */
const BLOCK = 32;
const LEAF_NODES = 64;
const PAD = 2;
const DEFAULT_COLOR = '#b0b0b0';

/** Grid layout for a tree: origin, voxel and node counts. */
export function sdfGrid(compiled: CompiledSdf, resolution: number): { origin: [number, number, number]; voxel: number; dims: [number, number, number] } {
  const b = compiled.bounds;
  if (!b) throw new SdfBakeError('The tree has no shape to bake.');
  const extent = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  if (!(extent > 0) || !Number.isFinite(extent)) throw new SdfBakeError('The tree has no extent to bake.');
  const res = Math.round(Math.min(SDF_RESOLUTION_MAX, Math.max(SDF_RESOLUTION_MIN, resolution)));
  const voxel = extent / (res - 2 * PAD);
  const dims = [0, 1, 2].map((k) => Math.min(res + 1, Math.ceil((b.max[k]! - b.min[k]!) / voxel) + 1 + 2 * PAD)) as [number, number, number];
  const origin: [number, number, number] = [0, 1, 2].map((k) => {
    // Centre the shape in its (possibly rounded-up) span of nodes.
    const span = (dims[k]! - 1) * voxel;
    return (b.min[k]! + b.max[k]!) / 2 - span / 2;
  }) as [number, number, number];
  return { origin, voxel, dims };
}

export function bakeSdf(tree: SdfTree, options: SdfBakeOptions = {}): SdfBakeResult {
  const compiled = compileSdf(tree);
  const resolution = Math.round(Math.min(SDF_RESOLUTION_MAX, Math.max(SDF_RESOLUTION_MIN, options.resolution ?? SDF_RESOLUTION_DEFAULT)));
  const { origin, voxel, dims } = sdfGrid(compiled, resolution);
  const [nx, ny, nz] = dims;
  const values = new Float32Array(nx * ny * nz);
  const f = compiled.distance;
  const L = compiled.lipschitz;
  let evaluated = 0;
  let skipped = 0;

  /** Fills or samples the block of nodes [i0, i1) × [j0, j1) × [k0, k1), splitting it while it may hold the surface. */
  const visit = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number): void => {
    const count = (i1 - i0) * (j1 - j0) * (k1 - k0);
    if (count === 0) return;
    if (!options.dense && count > LEAF_NODES) {
      const cx = origin[0] + ((i0 + i1 - 1) / 2) * voxel;
      const cy = origin[1] + ((j0 + j1 - 1) / 2) * voxel;
      const cz = origin[2] + ((k0 + k1 - 1) / 2) * voxel;
      const half = (Math.hypot(i1 - 1 - i0, j1 - 1 - j0, k1 - 1 - k0) / 2) * voxel;
      const d = f(cx, cy, cz);
      evaluated += 1;
      // No node of this block is within 1.5 voxels of the surface: fill it, keep its sign.
      const margin = Math.abs(d) / L - half;
      if (margin > 1.5 * voxel) {
        const fill = Math.sign(d) * margin;
        for (let k = k0; k < k1; k += 1) for (let j = j0; j < j1; j += 1) values.fill(fill, i0 + nx * (j + ny * k), i1 + nx * (j + ny * k));
        skipped += count;
        return;
      }
      const im = (i0 + i1) >> 1, jm = (j0 + j1) >> 1, km = (k0 + k1) >> 1;
      for (const [a, b] of [[i0, im], [im, i1]] as const)
        for (const [c, e] of [[j0, jm], [jm, j1]] as const)
          for (const [g, h] of [[k0, km], [km, k1]] as const) visit(a, b, c, e, g, h);
      return;
    }
    for (let k = k0; k < k1; k += 1) {
      const z = origin[2] + k * voxel;
      for (let j = j0; j < j1; j += 1) {
        const y = origin[1] + j * voxel;
        const row = nx * (j + ny * k);
        for (let i = i0; i < i1; i += 1) values[row + i] = f(origin[0] + i * voxel, y, z);
      }
    }
    evaluated += count;
  };
  for (let bk = 0; bk < nz; bk += BLOCK)
    for (let bj = 0; bj < ny; bj += BLOCK)
      for (let bi = 0; bi < nx; bi += BLOCK) visit(bi, Math.min(nx, bi + BLOCK), bj, Math.min(ny, bj + BLOCK), bk, Math.min(nz, bk + BLOCK));

  // The border must read as outside for the mesh to close; bounds are conservative, but clamp anyway.
  for (let k = 0; k < nz; k += 1)
    for (let j = 0; j < ny; j += 1)
      for (let i = 0; i < nx; i += 1) {
        if (i !== 0 && j !== 0 && k !== 0 && i !== nx - 1 && j !== ny - 1 && k !== nz - 1) {
          i = nx - 2;
          continue;
        }
        const at = i + nx * (j + ny * k);
        if (values[at]! <= 0) values[at] = voxel * 0.5;
      }

  const net = surfaceNets({ dims, origin, voxel, values });
  if (net.indices.length === 0) throw new SdfBakeError('The tree has no surface at this resolution — it may be empty (an intersection that does not overlap), or thinner than a voxel.');

  const groups = new Uint16Array(net.positions.length / 3);
  if (compiled.leaves.length > 1) {
    for (let v = 0; v < groups.length; v += 1) groups[v] = compiled.nearestLeaf(net.positions[v * 3]!, net.positions[v * 3 + 1]!, net.positions[v * 3 + 2]!);
  }
  return {
    positions: net.positions,
    indices: net.indices,
    groups,
    groupTable: compiled.leaves.map((l) => ({ name: l.name, color: l.color ?? DEFAULT_COLOR })),
    voxelSize: voxel,
    dims,
    resolution,
    evaluated,
    skipped,
  };
}
