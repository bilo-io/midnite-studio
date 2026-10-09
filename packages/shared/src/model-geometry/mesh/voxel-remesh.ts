import { MESH_GROUP_NONE } from './mesh-bin';
import { surfaceNets } from './surface-nets';

/**
 * Voxel remesh (Phase 104 Theme B): any closed triangle soup in, one watertight, evenly-tessellated
 * mesh out. Used to turn a design's primitives into a sculptable part, and in sculpt mode (Theme D) to
 * even out stretched topology.
 *
 * 1. A signed-distance volume: the exact distance to the nearest triangle for every grid node within
 *    two voxels of the surface (large triangles are split first so the band stays tight), and the sign
 *    from a winding count — each grid row is cast as a ray along +x, every triangle crossing it adds
 *    +1 entering or -1 leaving, so overlapping parts (a head sphere half sunk into a body) read as one
 *    solid where a parity test would punch a hole through the overlap.
 * 2. The isosurface at zero by {@link surfaceNets}.
 *
 * Each triangle may carry a group id; every output vertex takes the group of the triangle nearest it,
 * so material assignment survives as vertex groups.
 */

export type RemeshSource = {
  /** xyz triples. */
  positions: ArrayLike<number>;
  /** Triangle corners, counter-clockwise from outside. */
  indices: ArrayLike<number>;
  /** One group id (< 0xffff) per triangle. */
  groups?: ArrayLike<number>;
};

export type RemeshOptions = {
  /** Edge length of a voxel in model units. Wins over `targetVertices`. */
  voxelSize?: number;
  /** Aim for about this many vertices (the surface area divided into voxel-sized cells). Default 20 000. */
  targetVertices?: number;
  /** Grid-node cap (default {@link REMESH_MAX_CELLS}); a request that needs more is coarsened. */
  maxCells?: number;
};

export type RemeshResult = {
  positions: Float32Array;
  indices: Uint32Array;
  /** One group id per vertex (`MESH_GROUP_NONE` when the source had none). */
  groups: Uint16Array;
  /** The voxel size actually used (a request is coarsened to respect {@link REMESH_MAX_CELLS}). */
  voxelSize: number;
  /** Grid nodes along x, y, z. */
  dims: [number, number, number];
  /** The request had to be made coarser than asked. */
  coarsened: boolean;
};

export class RemeshError extends Error {
  override readonly name = 'RemeshError';
}

/** Grid nodes allowed in one remesh — 64 MB of distances. */
export const REMESH_MAX_CELLS = 16_000_000;
export const REMESH_MIN_VOXEL = 1e-4;
export const REMESH_DEFAULT_TARGET_VERTICES = 20_000;
export const REMESH_MAX_TARGET_VERTICES = 1_000_000;
const BAND = 2;
const PAD = 3;
const MAX_SPLIT_TRIANGLES = 4_000_000;

type Tri = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; group: number };

/** Squared distance from point p to triangle abc (Ericson, Real-Time Collision Detection §5.1.5). */
export function pointTriangleDistSq(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  const dist = (qx: number, qy: number, qz: number): number => (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
  if (d1 <= 0 && d2 <= 0) return dist(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return dist(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return dist(ax + v * abx, ay + v * aby, az + v * abz);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return dist(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return dist(ax + w * acx, ay + w * acy, az + w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return dist(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return dist(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

const len = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => Math.hypot(ax - bx, ay - by, az - bz);

export function voxelRemesh(source: RemeshSource, options: RemeshOptions = {}): RemeshResult {
  const { positions, indices } = source;
  const triCount = Math.floor(indices.length / 3);
  if (triCount === 0) throw new RemeshError('There is no geometry to remesh.');

  // Bounds and surface area.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = positions[i + k]!;
      if (!Number.isFinite(v)) throw new RemeshError('The geometry has a non-finite coordinate.');
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  let area = 0;
  for (let t = 0; t < triCount; t += 1) {
    const a = indices[t * 3]! * 3, b = indices[t * 3 + 1]! * 3, c = indices[t * 3 + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  if (area <= 0) throw new RemeshError('The geometry has no surface area.');

  // Voxel size: asked for, or whatever puts about `targetVertices` on the surface; then coarsened to fit the grid cap.
  const target = Math.min(REMESH_MAX_TARGET_VERTICES, Math.max(100, options.targetVertices ?? REMESH_DEFAULT_TARGET_VERTICES));
  const requested = Math.max(REMESH_MIN_VOXEL, options.voxelSize ?? Math.sqrt(area / target));
  let voxel = requested;
  const dimsFor = (h: number): [number, number, number] => [0, 1, 2].map((k) => Math.ceil((max[k]! - min[k]!) / h) + 1 + 2 * PAD) as [number, number, number];
  let dims = dimsFor(voxel);
  const maxCells = Math.min(REMESH_MAX_CELLS, options.maxCells ?? REMESH_MAX_CELLS);
  while (dims[0] * dims[1] * dims[2] > maxCells) {
    voxel *= 1.1;
    dims = dimsFor(voxel);
  }
  const [nx, ny, nz] = dims;
  const origin: [number, number, number] = [min[0]! - PAD * voxel, min[1]! - PAD * voxel, min[2]! - PAD * voxel];
  const band = BAND * voxel;

  // The distance band. Triangles longer than 4 voxels are split so a thin diagonal does not claim a huge box.
  const FAR = band + voxel;
  const dist = new Float32Array(nx * ny * nz).fill(FAR * FAR);
  const owner = new Uint16Array(nx * ny * nz).fill(MESH_GROUP_NONE);
  const stack: Tri[] = [];
  let produced = 0;
  const splitLimit = 4 * voxel;
  const raster = (t: Tri): void => {
    const x0 = Math.max(0, Math.floor((Math.min(t.ax, t.bx, t.cx) - band - origin[0]) / voxel));
    const x1 = Math.min(nx - 1, Math.ceil((Math.max(t.ax, t.bx, t.cx) + band - origin[0]) / voxel));
    const y0 = Math.max(0, Math.floor((Math.min(t.ay, t.by, t.cy) - band - origin[1]) / voxel));
    const y1 = Math.min(ny - 1, Math.ceil((Math.max(t.ay, t.by, t.cy) + band - origin[1]) / voxel));
    const z0 = Math.max(0, Math.floor((Math.min(t.az, t.bz, t.cz) - band - origin[2]) / voxel));
    const z1 = Math.min(nz - 1, Math.ceil((Math.max(t.az, t.bz, t.cz) + band - origin[2]) / voxel));
    for (let k = z0; k <= z1; k += 1) {
      const pz = origin[2] + k * voxel;
      for (let j = y0; j <= y1; j += 1) {
        const py = origin[1] + j * voxel;
        for (let i = x0; i <= x1; i += 1) {
          const at = i + nx * (j + ny * k);
          const d = pointTriangleDistSq(origin[0] + i * voxel, py, pz, t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz);
          if (d < dist[at]!) {
            dist[at] = d;
            owner[at] = t.group;
          }
        }
      }
    }
  };
  for (let t = 0; t < triCount; t += 1) {
    const a = indices[t * 3]! * 3, b = indices[t * 3 + 1]! * 3, c = indices[t * 3 + 2]! * 3;
    stack.push({
      ax: positions[a]!, ay: positions[a + 1]!, az: positions[a + 2]!,
      bx: positions[b]!, by: positions[b + 1]!, bz: positions[b + 2]!,
      cx: positions[c]!, cy: positions[c + 1]!, cz: positions[c + 2]!,
      group: source.groups ? Math.min(source.groups[t]!, MESH_GROUP_NONE - 1) : MESH_GROUP_NONE,
    });
    while (stack.length > 0) {
      const tri = stack.pop()!;
      const ab = len(tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz);
      const bc = len(tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz);
      const ca = len(tri.cx, tri.cy, tri.cz, tri.ax, tri.ay, tri.az);
      const longest = Math.max(ab, bc, ca);
      if (longest <= splitLimit || produced >= MAX_SPLIT_TRIANGLES) {
        produced += 1;
        raster(tri);
        continue;
      }
      // Split the longest edge at its midpoint.
      if (longest === ab) {
        const mx = (tri.ax + tri.bx) / 2, my = (tri.ay + tri.by) / 2, mz = (tri.az + tri.bz) / 2;
        stack.push({ ...tri, bx: mx, by: my, bz: mz }, { ...tri, ax: mx, ay: my, az: mz });
      } else if (longest === bc) {
        const mx = (tri.bx + tri.cx) / 2, my = (tri.by + tri.cy) / 2, mz = (tri.bz + tri.cz) / 2;
        stack.push({ ...tri, cx: mx, cy: my, cz: mz }, { ...tri, bx: mx, by: my, bz: mz });
      } else {
        const mx = (tri.cx + tri.ax) / 2, my = (tri.cy + tri.ay) / 2, mz = (tri.cz + tri.az) / 2;
        stack.push({ ...tri, ax: mx, ay: my, az: mz }, { ...tri, cx: mx, cy: my, cz: mz });
      }
    }
  }

  // The sign: cast every (y, z) row along +x and keep a running winding number. The ray is nudged off the
  // lattice by an irrational-ish fraction of a voxel so it never runs exactly along a shared edge.
  const rows: number[][] = new Array<number[]>(ny * nz);
  const nudgeY = 0.123456789 * voxel * 1e-3;
  const nudgeZ = 0.376543211 * voxel * 1e-3;
  for (let t = 0; t < triCount; t += 1) {
    const a = indices[t * 3]! * 3, b = indices[t * 3 + 1]! * 3, c = indices[t * 3 + 2]! * 3;
    const ay = positions[a + 1]!, az = positions[a + 2]!;
    const by = positions[b + 1]!, bz = positions[b + 2]!;
    const cy = positions[c + 1]!, cz = positions[c + 2]!;
    // Normal's x component (twice the signed yz-projected area): sign says entering or leaving.
    const nxc = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    if (nxc === 0) continue;
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - origin[1] - nudgeY) / voxel));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - origin[1] - nudgeY) / voxel));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - origin[2] - nudgeZ) / voxel));
    const k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - origin[2] - nudgeZ) / voxel));
    const ax = positions[a]!, bx = positions[b]!, cx = positions[c]!;
    for (let k = k0; k <= k1; k += 1) {
      const pz = origin[2] + k * voxel + nudgeZ;
      for (let j = j0; j <= j1; j += 1) {
        const py = origin[1] + j * voxel + nudgeY;
        // Barycentric coordinates of (py, pz) in the projected triangle.
        const w0 = ((by - py) * (cz - pz) - (bz - pz) * (cy - py)) / nxc;
        const w1 = ((cy - py) * (az - pz) - (cz - pz) * (ay - py)) / nxc;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const x = w0 * ax + w1 * bx + w2 * cx;
        // Facing +x (nxc > 0) means the ray leaves the solid here.
        const row = j + ny * k;
        (rows[row] ??= []).push(x, nxc > 0 ? -1 : 1);
      }
    }
  }

  const values = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const row = rows[j + ny * k];
      let order: number[] | null = null;
      if (row) {
        order = [];
        for (let e = 0; e < row.length; e += 2) order.push(e);
        order.sort((p, q) => row[p]! - row[q]!);
      }
      let next = 0;
      let winding = 0;
      for (let i = 0; i < nx; i += 1) {
        const x = origin[0] + i * voxel;
        while (order && next < order.length && row![order[next]!]! < x) {
          winding += row![order[next]! + 1]!;
          next += 1;
        }
        const at = i + nx * (j + ny * k);
        const d = Math.min(Math.sqrt(dist[at]!), FAR);
        values[at] = winding !== 0 ? -d : d;
      }
    }
  }

  const net = surfaceNets({ dims, origin, voxel, values });
  if (net.indices.length === 0) throw new RemeshError('The remesh found no surface — the geometry may not be a closed solid, or the voxels are too coarse for it.');
  const groups = new Uint16Array(net.anchors.length);
  for (let v = 0; v < groups.length; v += 1) groups[v] = owner[net.anchors[v]!]!;
  return { positions: net.positions, indices: net.indices, groups, voxelSize: voxel, dims, coarsened: voxel > requested * 1.0001 };
}
