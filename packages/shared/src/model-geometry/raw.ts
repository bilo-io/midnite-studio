import { applyDirection, applyNormal, applyPoint, determinant3, normalMatrix, v3, type Mat4, type Vec3 } from './math';

/**
 * The kernel's mesh type and the operations every builder shares: welding, angle-weighted smooth
 * normals, orientation repair, transforms, polygon triangulation. A `RawMesh` is plain number
 * arrays — `positions` and `normals` are xyz triples, `indices` are triangle corners.
 */
export type RawMesh = { positions: number[]; normals: number[]; indices: number[] };
/** Geometry before normals exist: what welding, modifiers and CSG pass around. */
export type Soup = { positions: number[]; indices: number[] };

export const emptyMesh = (): RawMesh => ({ positions: [], normals: [], indices: [] });
export const triangleCount = (m: { indices: readonly number[] }): number => m.indices.length / 3;

export const pointAt = (positions: readonly number[], i: number): Vec3 => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];

/** Pushes one vertex, normalising `n`; returns its index. */
export function pushVertex(raw: RawMesh, p: Vec3, n: Vec3): number {
  raw.positions.push(p[0], p[1], p[2]);
  const unit = v3.norm(n);
  raw.normals.push(unit[0], unit[1], unit[2]);
  return raw.positions.length / 3 - 1;
}

export const WELD_EPS = 1e-5;

/** Merges vertices closer than `eps` (grid-quantised); drops triangles that collapse. */
export function weld(mesh: { positions: readonly number[]; indices: readonly number[] }, eps = WELD_EPS): Soup {
  const map = new Map<string, number>();
  const remap: number[] = [];
  const positions: number[] = [];
  const count = mesh.positions.length / 3;
  for (let i = 0; i < count; i += 1) {
    const x = mesh.positions[i * 3]!;
    const y = mesh.positions[i * 3 + 1]!;
    const z = mesh.positions[i * 3 + 2]!;
    const key = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let at = map.get(key);
    if (at === undefined) {
      at = positions.length / 3;
      map.set(key, at);
      positions.push(x, y, z);
    }
    remap.push(at);
  }
  const indices: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = remap[mesh.indices[t]!]!;
    const b = remap[mesh.indices[t + 1]!]!;
    const c = remap[mesh.indices[t + 2]!]!;
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }
  return { positions, indices };
}

/**
 * Per-corner normals averaged (by corner angle) over the faces around a vertex that lie within
 * `angleDeg` of the corner's own face — so a cube stays hard at 35° and a sphere comes out smooth.
 * Corners whose averaged normal differs get their own vertex.
 */
export function smoothNormals(soup: Soup, angleDeg: number): RawMesh {
  const { positions, indices } = soup;
  const faceCount = indices.length / 3;
  const faceNormals: Vec3[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    const a = pointAt(positions, indices[f * 3]!);
    const b = pointAt(positions, indices[f * 3 + 1]!);
    const c = pointAt(positions, indices[f * 3 + 2]!);
    faceNormals.push(v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a))));
  }
  const incident: number[][] = Array.from({ length: positions.length / 3 }, () => []);
  for (let f = 0; f < faceCount; f += 1) for (let k = 0; k < 3; k += 1) incident[indices[f * 3 + k]!]!.push(f);

  /** Corner angle of face `f` at vertex `v`. */
  const cornerAngle = (f: number, v: number): number => {
    const k = [0, 1, 2].find((corner) => indices[f * 3 + corner] === v) ?? 0;
    const p = pointAt(positions, v);
    const next = pointAt(positions, indices[f * 3 + ((k + 1) % 3)]!);
    const prev = pointAt(positions, indices[f * 3 + ((k + 2) % 3)]!);
    const e1 = v3.norm(v3.sub(next, p));
    const e2 = v3.norm(v3.sub(prev, p));
    return Math.acos(Math.max(-1, Math.min(1, v3.dot(e1, e2))));
  };

  const threshold = angleDeg >= 180 ? -2 : Math.cos((angleDeg * Math.PI) / 180) - 1e-6;
  const out = emptyMesh();
  const made = new Map<string, number>();
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = indices[f * 3 + k]!;
      const own = faceNormals[f]!;
      let sum: Vec3 = [0, 0, 0];
      for (const g of incident[v]!) {
        if (v3.dot(own, faceNormals[g]!) < threshold) continue;
        sum = v3.add(sum, v3.scale(faceNormals[g]!, cornerAngle(g, v)));
      }
      const n = v3.norm(sum, own);
      const key = `${v}|${Math.round(n[0] * 500)},${Math.round(n[1] * 500)},${Math.round(n[2] * 500)}`;
      let at = made.get(key);
      if (at === undefined) {
        at = pushVertex(out, pointAt(positions, v), n);
        made.set(key, at);
      }
      out.indices.push(at);
    }
  }
  return out;
}

/** Six times the signed volume of a closed triangle mesh — positive when wound CCW outward. */
export function signedVolume(positions: readonly number[], indices: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = pointAt(positions, indices[i]!);
    const b = pointAt(positions, indices[i + 1]!);
    const c = pointAt(positions, indices[i + 2]!);
    sum += v3.dot(a, v3.cross(b, c));
  }
  return sum / 6;
}

/** Swaps two corners of every triangle (and negates normals when present). */
export function flipWinding(mesh: { indices: number[]; normals?: number[] }): void {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tmp = mesh.indices[i + 1]!;
    mesh.indices[i + 1] = mesh.indices[i + 2]!;
    mesh.indices[i + 2] = tmp;
  }
  if (mesh.normals) mesh.normals = mesh.normals.map((value) => -value);
}

/**
 * Safety net for a part that still came out inside-out (a lathe profile listed top to bottom): flip
 * winding and normals together. Winding and normals of those shapes derive from the same profile
 * direction, so they are always wrong together.
 */
export function orient(raw: RawMesh): RawMesh {
  if (signedVolume(raw.positions, raw.indices) < 0) flipWinding(raw);
  return raw;
}

/** Drop zero-area triangles (cone apex, lathe poles) that would only confuse importers. */
export function dropDegenerate(raw: RawMesh): RawMesh {
  const kept: number[] = [];
  for (let i = 0; i < raw.indices.length; i += 3) {
    const pa = pointAt(raw.positions, raw.indices[i]!);
    const pb = pointAt(raw.positions, raw.indices[i + 1]!);
    const pc = pointAt(raw.positions, raw.indices[i + 2]!);
    if (v3.len(v3.cross(v3.sub(pb, pa), v3.sub(pc, pa))) > 1e-12) kept.push(raw.indices[i]!, raw.indices[i + 1]!, raw.indices[i + 2]!);
  }
  return { ...raw, indices: kept };
}

/** Is every edge shared by exactly two triangles (after welding)? Used to decide whether orientation can be judged by volume. */
export function isClosed(mesh: { positions: readonly number[]; indices: readonly number[] }): boolean {
  const welded = weld(mesh);
  if (welded.indices.length === 0) return false;
  const edges = new Map<string, number>();
  for (let t = 0; t < welded.indices.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = welded.indices[t + k]!;
      const b = welded.indices[t + ((k + 1) % 3)]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + (a < b ? 1 : 256));
    }
  }
  // Closed and consistently wound: each undirected edge is traversed once each way (1 + 256).
  for (const count of edges.values()) if (count !== 257) return false;
  return true;
}

/** Returns a transformed copy; mirroring transforms (negative determinant) flip the winding to stay outward. */
export function transformMesh(mesh: RawMesh, m: Mat4): RawMesh {
  const n3 = normalMatrix(m);
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions.push(...applyPoint(m, pointAt(mesh.positions, i / 3)));
    normals.push(...applyNormal(n3, [mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!]));
  }
  const out: RawMesh = { positions, normals, indices: [...mesh.indices] };
  if (determinant3(m) < 0) {
    for (let i = 0; i < out.indices.length; i += 3) {
      const tmp = out.indices[i + 1]!;
      out.indices[i + 1] = out.indices[i + 2]!;
      out.indices[i + 2] = tmp;
    }
  }
  return out;
}

export function transformSoup(soup: Soup, m: Mat4): Soup {
  const positions: number[] = [];
  for (let i = 0; i < soup.positions.length; i += 3) positions.push(...applyPoint(m, pointAt(soup.positions, i / 3)));
  const indices = [...soup.indices];
  if (determinant3(m) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = tmp;
    }
  }
  return { positions, indices };
}

/** Appends `extra` to `base` in place. */
export function appendMesh(base: RawMesh, extra: RawMesh): void {
  const offset = base.positions.length / 3;
  base.positions.push(...extra.positions);
  base.normals.push(...extra.normals);
  for (const index of extra.indices) base.indices.push(index + offset);
}

export function appendSoup(base: Soup, extra: Soup): void {
  const offset = base.positions.length / 3;
  for (const value of extra.positions) base.positions.push(value);
  for (const index of extra.indices) base.indices.push(index + offset);
}

export function bounds(positions: readonly number[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }
  return { min, max };
}

export { applyDirection };

// --- 2-D polygons ----------------------------------------------------------------

export const signedArea2D = (poly: readonly (readonly [number, number])[]): number => {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
};

/** Ear-clipping triangulation of a simple polygon; returns index triples into `poly`, counter-clockwise by {@link signedArea2D}. */
export function triangulatePolygon(poly: readonly (readonly [number, number])[]): [number, number, number][] {
  const n = poly.length;
  const order = Array.from({ length: n }, (_, i) => i);
  if (signedArea2D(poly) < 0) order.reverse();
  const cross2 = (o: number, a: number, b: number): number => {
    const po = poly[o]!;
    const pa = poly[a]!;
    const pb = poly[b]!;
    return (pa[0] - po[0]) * (pb[1] - po[1]) - (pa[1] - po[1]) * (pb[0] - po[0]);
  };
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;
  const tris: [number, number, number][] = [];
  let guard = n * n;
  while (order.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < order.length; i += 1) {
      const a = order[(i + order.length - 1) % order.length]!;
      const b = order[i]!;
      const c = order[(i + 1) % order.length]!;
      if (cross2(a, b, c) <= 1e-12) continue;
      const blocked = order.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c));
      if (blocked) continue;
      tris.push([a, b, c]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    // A degenerate / self-intersecting outline: drop the first vertex rather than loop forever.
    if (!clipped) order.shift();
  }
  if (order.length === 3) tris.push([order[0]!, order[1]!, order[2]!]);
  return tris;
}
