/**
 * Road ribbons and junction patches (Phase 105 Theme H), meshed from `roads.json` on whichever side
 * needs them — the viewer today, the export (Theme I) next. Ribbons follow a centripetal Catmull-Rom
 * through the edge's control points, sampled every 2 m and lifted 0.05 m above the conformed ground.
 */
import type { TerrainRoadsFile } from '../media-terrain';
import { sampleHeight } from './field-sample';
import type { Heightfield } from './heightfield';
import { sampleCatmullRom } from './road-graph';

export const ROAD_MESH_STEP_M = 2;
export const ROAD_MESH_LIFT_M = 0.05;

export type RoadMeshPart = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  /** U across the road (0–1), V along it in road widths. */
  uvs: Float32Array;
  indices: Uint32Array;
};

type Xz = [number, number];

/** Trims `trimA` metres off the start and `trimB` off the end of a polyline. */
function trim(path: Xz[], trimA: number, trimB: number): Xz[] {
  const cut = (pts: Xz[], dist: number): Xz[] => {
    if (dist <= 0) return pts;
    let left = dist;
    for (let i = 1; i < pts.length; i += 1) {
      const [ax, az] = pts[i - 1]!;
      const [bx, bz] = pts[i]!;
      const seg = Math.hypot(bx - ax, bz - az);
      if (seg > left) {
        const t = left / seg;
        return [[ax + (bx - ax) * t, az + (bz - az) * t], ...pts.slice(i)];
      }
      left -= seg;
    }
    return pts.slice(-1);
  };
  const front = cut(path, trimA);
  return cut([...front].reverse(), trimB).reverse();
}

/**
 * One ribbon per edge plus one triangle-fan patch per junction (degree ≥ 3). Ribbon ends at a
 * junction are pulled back by the widest incident half-width, and the patch fills that hole.
 */
export function roadMeshes(roads: TerrainRoadsFile, field: Heightfield): RoadMeshPart[] {
  const parts: RoadMeshPart[] = [];
  const nodeHalf = new Map<number, number>();
  for (const e of roads.edges) {
    for (const id of [e.a, e.b]) nodeHalf.set(id, Math.max(nodeHalf.get(id) ?? 0, e.widthM / 2));
  }
  const junction = (id: number): boolean => (roads.nodes.find((n) => n.id === id)?.degree ?? 0) >= 3;
  const y = (x: number, z: number): number => sampleHeight(field, x, z) + ROAD_MESH_LIFT_M;
  /** Per junction, the ribbon end pairs that reach it: [left, right] in world xz. */
  const ends = new Map<number, Xz[]>();

  for (const edge of roads.edges) {
    const control: Xz[] = edge.points.map(([x, , z]) => [x, z]);
    if (control.length < 2) continue;
    let centre = sampleCatmullRom(control, ROAD_MESH_STEP_M);
    centre = trim(centre, junction(edge.a) ? nodeHalf.get(edge.a)! : 0, junction(edge.b) ? nodeHalf.get(edge.b)! : 0);
    if (centre.length < 2) continue;
    const half = edge.widthM / 2;
    const count = centre.length;
    const positions = new Float32Array(count * 2 * 3);
    const normals = new Float32Array(count * 2 * 3);
    const uvs = new Float32Array(count * 2 * 2);
    const indices = new Uint32Array((count - 1) * 6);
    let along = 0;
    for (let i = 0; i < count; i += 1) {
      const [x, z] = centre[i]!;
      const [px, pz] = centre[Math.max(0, i - 1)]!;
      const [nx, nz] = centre[Math.min(count - 1, i + 1)]!;
      const tx = nx - px;
      const tz = nz - pz;
      const tl = Math.hypot(tx, tz) || 1;
      // Left of the direction of travel, seen from above with Y up.
      const lx = tz / tl;
      const lz = -tx / tl;
      if (i > 0) along += Math.hypot(x - centre[i - 1]![0], z - centre[i - 1]![1]);
      const sides: Xz[] = [
        [x + lx * half, z + lz * half],
        [x - lx * half, z - lz * half],
      ];
      sides.forEach(([sx, sz], k) => {
        const v = i * 2 + k;
        positions.set([sx, y(sx, sz), sz], v * 3);
        normals.set([0, 1, 0], v * 3);
        uvs.set([k, along / edge.widthM], v * 2);
      });
      if (i === 0 && junction(edge.a)) pushEnd(ends, edge.a, sides);
      if (i === count - 1 && junction(edge.b)) pushEnd(ends, edge.b, sides);
    }
    for (let i = 0; i < count - 1; i += 1) {
      const a = i * 2;
      // Counter-clockwise seen from +Y: left(i), left(i+1), right(i) …
      indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
    }
    fixWinding(positions, indices);
    parts.push({ name: `road-${edge.id}`, positions, normals, uvs, indices });
  }

  for (const node of roads.nodes) {
    const rim = ends.get(node.id);
    if (!rim || rim.length < 3) continue;
    const [cx, , cz] = node.p;
    rim.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    const count = rim.length + 1;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    positions.set([cx, y(cx, cz), cz], 0);
    normals.set([0, 1, 0], 0);
    uvs.set([0.5, 0.5], 0);
    const radius = nodeHalf.get(node.id) || 1;
    rim.forEach(([x, z], i) => {
      positions.set([x, y(x, z), z], (i + 1) * 3);
      normals.set([0, 1, 0], (i + 1) * 3);
      uvs.set([0.5 + (x - cx) / (4 * radius), 0.5 + (z - cz) / (4 * radius)], (i + 1) * 2);
    });
    const indices = new Uint32Array(rim.length * 3);
    for (let i = 0; i < rim.length; i += 1) indices.set([0, i + 1, ((i + 1) % rim.length) + 1], i * 3);
    fixWinding(positions, indices);
    parts.push({ name: `junction-${node.id}`, positions, normals, uvs, indices });
  }
  return parts;
}

function pushEnd(ends: Map<number, Xz[]>, node: number, sides: Xz[]): void {
  const list = ends.get(node) ?? [];
  list.push(...sides);
  ends.set(node, list);
}

/** Flips any triangle whose geometric normal points down, so every face is up-facing (+Y). */
function fixWinding(positions: Float32Array, indices: Uint32Array): void {
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3;
    const b = indices[t + 1]! * 3;
    const c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    // y component of (b − a) × (c − a)
    if (uz * vx - ux * vz < 0) {
      const tmp = indices[t + 1]!;
      indices[t + 1] = indices[t + 2]!;
      indices[t + 2] = tmp;
    }
  }
}
