/**
 * Quadric edge-collapse decimation (Phase 104 Theme F, Garland & Heckbert).
 *
 * Every vertex carries the sum of the squared-distance quadrics of the planes around it; collapsing an
 * edge puts the survivor at whichever of the two ends or the midpoint costs least under the summed
 * quadric, and the cheapest collapse goes first. A collapse is refused when it would
 *
 * - touch a **border** — an edge used by one triangle. A UV unwrap splits vertices along every seam, so a
 *   seam *is* a border here: locking borders keeps UV seams, open edges and group-less silhouettes exactly
 *   where they were;
 * - break the manifold (the link condition: the ends may share only the apexes of the triangles on their edge);
 * - flip a neighbouring triangle's normal or squash it to nothing.
 *
 * Per-vertex attributes follow the survivor: a uv is the end's own or the midpoint's, a vertex group the
 * survivor's. A mesh with too many locked or protected edges stops short of the target and says so.
 */

export type DecimateSource = {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** One group id per vertex. */
  groups?: ArrayLike<number>;
  /** One uv pair per vertex. */
  uvs?: ArrayLike<number>;
};

export type DecimateOptions = {
  /** Triangles to end with. Wins over `ratio`. */
  targetTriangles?: number;
  /** Fraction of the triangles to keep (0–1). */
  ratio?: number;
  /** Keep every vertex on an open edge or UV seam where it is (default true). */
  lockBorders?: boolean;
  /** Refuse a collapse whose quadric error exceeds this (model units², default unlimited). */
  maxError?: number;
};

export type DecimateResult = {
  positions: Float32Array;
  indices: Uint32Array;
  groups?: Uint16Array;
  uvs?: Float32Array;
  before: number;
  after: number;
  /** The target the call asked for, after clamping. */
  target: number;
  /** The triangle target was reached. */
  reachedTarget: boolean;
  /** The largest quadric error of any collapse made. */
  maxError: number;
  /** Open-edge vertices the result still has — equal to the input's when borders are locked. */
  borderVertices: number;
};

type V3 = [number, number, number];

class Heap {
  private readonly cost: number[] = [];
  private readonly a: number[] = [];
  private readonly b: number[] = [];
  private readonly stamp: number[] = [];

  get size(): number {
    return this.cost.length;
  }

  push(cost: number, a: number, b: number, stamp: number): void {
    let i = this.cost.length;
    this.cost.push(cost);
    this.a.push(a);
    this.b.push(b);
    this.stamp.push(stamp);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cost[parent]! <= this.cost[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { cost: number; a: number; b: number; stamp: number } | null {
    const n = this.cost.length;
    if (n === 0) return null;
    const top = { cost: this.cost[0]!, a: this.a[0]!, b: this.b[0]!, stamp: this.stamp[0]! };
    const last = n - 1;
    this.swap(0, last);
    this.cost.pop();
    this.a.pop();
    this.b.pop();
    this.stamp.pop();
    let i = 0;
    const size = this.cost.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < size && this.cost[l]! < this.cost[m]!) m = l;
      if (r < size && this.cost[r]! < this.cost[m]!) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private swap(i: number, j: number): void {
    for (const arr of [this.cost, this.a, this.b, this.stamp]) {
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
  }
}

/** Symmetric 4×4 quadric as 10 numbers: a b c d / e f g / h i / j. */
const addPlane = (q: Float64Array, at: number, n: V3, d: number, w: number): void => {
  const [a, b, c] = n;
  q[at] = q[at]! + w * a * a;
  q[at + 1] = q[at + 1]! + w * a * b;
  q[at + 2] = q[at + 2]! + w * a * c;
  q[at + 3] = q[at + 3]! + w * a * d;
  q[at + 4] = q[at + 4]! + w * b * b;
  q[at + 5] = q[at + 5]! + w * b * c;
  q[at + 6] = q[at + 6]! + w * b * d;
  q[at + 7] = q[at + 7]! + w * c * c;
  q[at + 8] = q[at + 8]! + w * c * d;
  q[at + 9] = q[at + 9]! + w * d * d;
};

const evalQuadric = (q: Float64Array, ua: number, ub: number, x: number, y: number, z: number): number => {
  const g = (k: number): number => q[ua + k]! + q[ub + k]!;
  return (
    g(0) * x * x + 2 * g(1) * x * y + 2 * g(2) * x * z + 2 * g(3) * x + g(4) * y * y + 2 * g(5) * y * z + 2 * g(6) * y + g(7) * z * z + 2 * g(8) * z + g(9)
  );
};

const edgeKey = (a: number, b: number, n: number): number => (a < b ? a * n + b : b * n + a);

export function decimateMesh(source: DecimateSource, options: DecimateOptions = {}): DecimateResult {
  const n = source.positions.length / 3;
  const faceCount = source.indices.length / 3;
  const pos = Float64Array.from(source.positions);
  const faces = Uint32Array.from(source.indices);
  const uv = source.uvs ? Float64Array.from(source.uvs) : null;
  const grp = source.groups ? Uint16Array.from(source.groups as ArrayLike<number>) : null;
  const lockBorders = options.lockBorders ?? true;
  const maxError = options.maxError ?? Infinity;

  const target = Math.max(4, Math.min(faceCount, Math.round(options.targetTriangles ?? faceCount * Math.min(1, Math.max(0, options.ratio ?? 0.5)))));

  const alive = new Uint8Array(faceCount).fill(1);
  const vertexFaces: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let f = 0; f < faceCount; f += 1) for (let k = 0; k < 3; k += 1) vertexFaces[faces[f * 3 + k]!]!.add(f);

  // Border vertices: an edge used by one triangle.
  const edgeUse = new Map<number, number>();
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const key = edgeKey(faces[f * 3 + k]!, faces[f * 3 + ((k + 1) % 3)]!, n);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  const border = new Uint8Array(n);
  for (const [key, count] of edgeUse) {
    if (count !== 1) continue;
    border[Math.floor(key / n)] = 1;
    border[key % n] = 1;
  }
  const countBorder = (): number => {
    let c = 0;
    for (let v = 0; v < n; v += 1) if (border[v] && vertexFaces[v]!.size > 0) c += 1;
    return c;
  };
  const locked = (v: number): boolean => lockBorders && border[v] === 1;

  const quadrics = new Float64Array(n * 10);
  const faceNormal = (f: number): { n: V3; area: number } => {
    const a = faces[f * 3]! * 3;
    const b = faces[f * 3 + 1]! * 3;
    const c = faces[f * 3 + 2]! * 3;
    const e1: V3 = [pos[b]! - pos[a]!, pos[b + 1]! - pos[a + 1]!, pos[b + 2]! - pos[a + 2]!];
    const e2: V3 = [pos[c]! - pos[a]!, pos[c + 1]! - pos[a + 1]!, pos[c + 2]! - pos[a + 2]!];
    const x = e1[1] * e2[2] - e1[2] * e2[1];
    const y = e1[2] * e2[0] - e1[0] * e2[2];
    const z = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(x, y, z);
    return len > 0 ? { n: [x / len, y / len, z / len], area: len / 2 } : { n: [0, 0, 0], area: 0 };
  };
  for (let f = 0; f < faceCount; f += 1) {
    const { n: nrm, area } = faceNormal(f);
    if (area === 0) continue;
    const a = faces[f * 3]! * 3;
    const d = -(nrm[0] * pos[a]! + nrm[1] * pos[a + 1]! + nrm[2] * pos[a + 2]!);
    for (let k = 0; k < 3; k += 1) addPlane(quadrics, faces[f * 3 + k]! * 10, nrm, d, area);
  }

  const version = new Uint32Array(n);
  const heap = new Heap();
  let maxSeen = 0;

  /** The cheapest of the two ends and the midpoint for collapsing `u` and `v` (survivor is `v`). */
  const bestPlacement = (u: number, v: number): { cost: number; at: 0 | 1 | 2 } => {
    const pu = u * 3;
    const pv = v * 3;
    const cu = evalQuadric(quadrics, u * 10, v * 10, pos[pu]!, pos[pu + 1]!, pos[pu + 2]!);
    const cv = evalQuadric(quadrics, u * 10, v * 10, pos[pv]!, pos[pv + 1]!, pos[pv + 2]!);
    const cm = evalQuadric(quadrics, u * 10, v * 10, (pos[pu]! + pos[pv]!) / 2, (pos[pu + 1]! + pos[pv + 1]!) / 2, (pos[pu + 2]! + pos[pv + 2]!) / 2);
    // A locked end must stay where it is: the other end collapses onto it.
    if (locked(v)) return { cost: cv, at: 1 };
    if (locked(u)) return { cost: cu, at: 0 };
    if (cm <= cu && cm <= cv) return { cost: cm, at: 2 };
    return cu < cv ? { cost: cu, at: 0 } : { cost: cv, at: 1 };
  };

  const pushEdge = (a: number, b: number): void => {
    if (locked(a) && locked(b)) return;
    // The survivor is the locked end, if either is; otherwise the higher index (any is as good).
    const [u, v] = locked(a) ? [b, a] : locked(b) ? [a, b] : [a, b];
    const placed = bestPlacement(u, v);
    heap.push(Math.max(0, placed.cost), u, v, version[u]! * 2654435761 + version[v]!);
  };

  const neighbours = (v: number): Set<number> => {
    const out = new Set<number>();
    for (const f of vertexFaces[v]!) for (let k = 0; k < 3; k += 1) if (faces[f * 3 + k] !== v) out.add(faces[f * 3 + k]!);
    return out;
  };

  const seen = new Set<number>();
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k]!;
      const b = faces[f * 3 + ((k + 1) % 3)]!;
      const key = edgeKey(a, b, n);
      if (seen.has(key)) continue;
      seen.add(key);
      pushEdge(Math.min(a, b), Math.max(a, b));
    }
  }

  let triangles = faceCount;
  while (triangles > target) {
    const top = heap.pop();
    if (!top) break;
    const { a: u, b: v } = top;
    if (vertexFaces[u]!.size === 0 || vertexFaces[v]!.size === 0) continue;
    if (top.stamp !== version[u]! * 2654435761 + version[v]!) continue;
    if (top.cost > maxError) break;
    // Shared faces of the edge, and the link condition.
    const shared: number[] = [];
    for (const f of vertexFaces[u]!) if (vertexFaces[v]!.has(f)) shared.push(f);
    if (shared.length === 0 || shared.length > 2) continue;
    const nu = neighbours(u);
    const nv = neighbours(v);
    let common = 0;
    for (const w of nu) if (nv.has(w)) common += 1;
    if (common !== shared.length) continue;

    const placed = bestPlacement(u, v);
    const pu = u * 3;
    const pv = v * 3;
    const np: V3 = placed.at === 0 ? [pos[pu]!, pos[pu + 1]!, pos[pu + 2]!] : placed.at === 1 ? [pos[pv]!, pos[pv + 1]!, pos[pv + 2]!] : [(pos[pu]! + pos[pv]!) / 2, (pos[pu + 1]! + pos[pv + 1]!) / 2, (pos[pu + 2]! + pos[pv + 2]!) / 2];

    // Normals must not flip, and no triangle may collapse to a sliver, in the faces that survive.
    let ok = true;
    const touched = new Set<number>([...vertexFaces[u]!, ...vertexFaces[v]!]);
    for (const f of touched) {
      if (shared.includes(f)) continue;
      const before = faceNormal(f);
      const corners = [faces[f * 3]!, faces[f * 3 + 1]!, faces[f * 3 + 2]!];
      const moved = corners.map((c) => (c === u || c === v ? np : ([pos[c * 3]!, pos[c * 3 + 1]!, pos[c * 3 + 2]!] as V3)));
      const e1: V3 = [moved[1]![0] - moved[0]![0], moved[1]![1] - moved[0]![1], moved[1]![2] - moved[0]![2]];
      const e2: V3 = [moved[2]![0] - moved[0]![0], moved[2]![1] - moved[0]![1], moved[2]![2] - moved[0]![2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1];
      const cy = e1[2] * e2[0] - e1[0] * e2[2];
      const cz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.hypot(cx, cy, cz);
      if (len < 1e-14) {
        ok = false;
        break;
      }
      if (before.area > 0 && (cx * before.n[0] + cy * before.n[1] + cz * before.n[2]) / len < 0.2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Collapse u into v.
    const ua = uv ? [uv[u * 2]!, uv[u * 2 + 1]!] : null;
    const va = uv ? [uv[v * 2]!, uv[v * 2 + 1]!] : null;
    pos[pv] = np[0];
    pos[pv + 1] = np[1];
    pos[pv + 2] = np[2];
    if (uv && ua && va) {
      if (placed.at === 0) {
        uv[v * 2] = ua[0]!;
        uv[v * 2 + 1] = ua[1]!;
      } else if (placed.at === 2) {
        uv[v * 2] = (ua[0]! + va[0]!) / 2;
        uv[v * 2 + 1] = (ua[1]! + va[1]!) / 2;
      }
    }
    if (grp && placed.at === 0) grp[v] = grp[u]!;
    for (let k = 0; k < 10; k += 1) quadrics[v * 10 + k] = quadrics[v * 10 + k]! + quadrics[u * 10 + k]!;
    if (border[u]) border[v] = 1;
    for (const f of shared) {
      alive[f] = 0;
      for (let k = 0; k < 3; k += 1) vertexFaces[faces[f * 3 + k]!]!.delete(f);
      triangles -= 1;
    }
    for (const f of [...vertexFaces[u]!]) {
      for (let k = 0; k < 3; k += 1) if (faces[f * 3 + k] === u) faces[f * 3 + k] = v;
      vertexFaces[v]!.add(f);
    }
    vertexFaces[u]!.clear();
    version[v] = version[v]! + 1;
    version[u] = version[u]! + 1;
    if (top.cost > maxSeen) maxSeen = top.cost;
    for (const w of neighbours(v)) {
      version[w] = version[w]! + 1;
    }
    for (const w of neighbours(v)) {
      pushEdge(v, w);
      for (const x of neighbours(w)) if (x !== v && w < x) pushEdge(w, x);
    }
  }

  // Compact: only vertices an alive triangle still uses.
  const remap = new Int32Array(n).fill(-1);
  const outPos: number[] = [];
  const outUv: number[] = [];
  const outGrp: number[] = [];
  const outIdx: number[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k]!;
      if (remap[v]! < 0) {
        remap[v] = outPos.length / 3;
        outPos.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!);
        if (uv) outUv.push(uv[v * 2]!, uv[v * 2 + 1]!);
        if (grp) outGrp.push(grp[v]!);
      }
      outIdx.push(remap[v]!);
    }
  }
  return {
    positions: Float32Array.from(outPos),
    indices: Uint32Array.from(outIdx),
    ...(grp ? { groups: Uint16Array.from(outGrp) } : {}),
    ...(uv ? { uvs: Float32Array.from(outUv) } : {}),
    before: faceCount,
    after: outIdx.length / 3,
    target,
    reachedTarget: outIdx.length / 3 <= target,
    maxError: maxSeen,
    borderVertices: countBorder(),
  };
}
