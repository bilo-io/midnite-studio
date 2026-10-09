import { Bvh } from './bvh';
import { voxelRemesh, type RemeshSource } from './voxel-remesh';

/**
 * Quad-dominant retopology to a target face count (Phase 104 Theme F).
 *
 * The surface is re-tessellated onto a regular lattice by {@link voxelRemesh}, whose surface-nets surface is
 * made of quads (each emitted as two triangles) — an even, animation-friendly grid rather than the sliver
 * triangles of a sculpt or a decimation. The voxel size is searched until the face count lands within
 * tolerance of the target, vertices are snapped back onto the source surface (the lattice alone shrinks
 * thin features), and triangle pairs that form a near-planar, near-square quad are paired back into quads.
 *
 * **What this is not.** The lattice is axis-aligned, not aligned to a curvature or flow field, so edge loops
 * do not follow the form's muscles the way a hand retopology does; manual retopology is out of scope. The
 * mesh stays a triangle mesh on disk (`.mesh.bin` is triangles only) — `quads` is what a later quad export
 * would use, and `quadShare` how much of the surface it covers.
 */

export type RetopoOptions = {
  targetFaces: number;
  /** Snap vertices back onto the source surface (default true). */
  snap?: boolean;
  /** Face-count tolerance of the search, as a fraction of the target (default 0.15). */
  tolerance?: number;
  maxCells?: number;
};

export type RetopoResult = {
  positions: Float32Array;
  indices: Uint32Array;
  groups: Uint16Array;
  /** Four corner indices per quad, counter-clockwise. */
  quads: Uint32Array;
  /** Triangles left unpaired. */
  looseTriangles: number;
  /** Share of the triangles that paired into quads (0–1). */
  quadShare: number;
  faces: number;
  targetFaces: number;
  voxelSize: number;
  coarsened: boolean;
  /** How far snapping moved the vertices (largest, model units). */
  maxSnap: number;
};

export const RETOPO_MIN_FACES = 100;
export const RETOPO_MAX_FACES = 2_000_000;

type V3 = [number, number, number];

export function retopologize(source: RemeshSource, options: RetopoOptions): RetopoResult {
  const target = Math.min(RETOPO_MAX_FACES, Math.max(RETOPO_MIN_FACES, Math.round(options.targetFaces)));
  const tolerance = options.tolerance ?? 0.15;
  let targetVertices = Math.max(50, Math.round(target / 2));
  let best: ReturnType<typeof voxelRemesh> | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const out = voxelRemesh(source, { targetVertices, ...(options.maxCells ? { maxCells: options.maxCells } : {}) });
    const faces = out.indices.length / 3;
    if (!best || Math.abs(faces - target) < Math.abs(best.indices.length / 3 - target)) best = out;
    if (faces === 0 || Math.abs(faces - target) / target <= tolerance) break;
    targetVertices = Math.max(50, Math.round((targetVertices * target) / faces));
  }
  const out = best!;
  const positions = Float32Array.from(out.positions);

  let maxSnap = 0;
  if (options.snap !== false && out.indices.length > 0) {
    const srcPositions = Float32Array.from(source.positions as ArrayLike<number>);
    const srcIndices = Uint32Array.from(source.indices as ArrayLike<number>);
    const bvh = new Bvh(srcPositions, srcIndices);
    const reach = out.voxelSize * 1.5;
    for (let v = 0; v < positions.length / 3; v += 1) {
      const hit = bvh.closestPoint([positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!], reach);
      if (!hit) continue;
      positions[v * 3] = hit.point[0];
      positions[v * 3 + 1] = hit.point[1];
      positions[v * 3 + 2] = hit.point[2];
      if (hit.distance > maxSnap) maxSnap = hit.distance;
    }
  }

  const { quads, loose } = pairQuads(positions, out.indices);
  const faces = out.indices.length / 3;
  return {
    positions,
    indices: out.indices,
    groups: out.groups,
    quads,
    looseTriangles: loose,
    quadShare: faces === 0 ? 0 : (quads.length / 4 * 2) / faces,
    faces,
    targetFaces: target,
    voxelSize: out.voxelSize,
    coarsened: out.coarsened,
    maxSnap,
  };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

/** Greedily pairs adjacent triangles into the squarest near-planar quads. */
export function pairQuads(positions: Float32Array, indices: Uint32Array): { quads: Uint32Array; loose: number } {
  const faces = indices.length / 3;
  const P = (v: number): V3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
  const normals: V3[] = [];
  for (let f = 0; f < faces; f += 1) normals.push(unit(cross(sub(P(indices[f * 3 + 1]!), P(indices[f * 3]!)), sub(P(indices[f * 3 + 2]!), P(indices[f * 3]!)))));

  // Directed edge → triangle, so a triangle's neighbour across p→q is the one holding q→p.
  const directed = new Map<string, number>();
  for (let f = 0; f < faces; f += 1) for (let k = 0; k < 3; k += 1) directed.set(`${indices[f * 3 + k]}:${indices[f * 3 + ((k + 1) % 3)]}`, f);

  type Candidate = { score: number; a: number; b: number; quad: [number, number, number, number] };
  const candidates: Candidate[] = [];
  for (let f = 0; f < faces; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const p = indices[f * 3 + k]!;
      const q = indices[f * 3 + ((k + 1) % 3)]!;
      const r = indices[f * 3 + ((k + 2) % 3)]!;
      const g = directed.get(`${q}:${p}`);
      if (g === undefined || g <= f) continue;
      if (dot(normals[f]!, normals[g]!) < 0.85) continue;
      // The other triangle's apex.
      let s = -1;
      for (let j = 0; j < 3; j += 1) {
        const c = indices[g * 3 + j]!;
        if (c !== p && c !== q) s = c;
      }
      if (s < 0) continue;
      const quad: [number, number, number, number] = [p, s, q, r];
      let worst = 0;
      let convex = true;
      for (let c = 0; c < 4; c += 1) {
        const prev = P(quad[(c + 3) % 4]!);
        const here = P(quad[c]!);
        const next = P(quad[(c + 1) % 4]!);
        const e1 = unit(sub(prev, here));
        const e2 = unit(sub(next, here));
        const angle = (Math.acos(Math.max(-1, Math.min(1, dot(e1, e2)))) * 180) / Math.PI;
        if (angle >= 175) convex = false;
        worst = Math.max(worst, Math.abs(angle - 90));
      }
      if (!convex || worst > 55) continue;
      candidates.push({ score: 1 - worst / 90, a: f, b: g, quad });
    }
  }
  candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
  const used = new Uint8Array(faces);
  const out: number[] = [];
  for (const c of candidates) {
    if (used[c.a] || used[c.b]) continue;
    used[c.a] = 1;
    used[c.b] = 1;
    out.push(...c.quad);
  }
  let loose = 0;
  for (let f = 0; f < faces; f += 1) if (!used[f]) loose += 1;
  return { quads: Uint32Array.from(out), loose };
}
