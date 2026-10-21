/**
 * Multires for sculpt meshes (Phase 104 Theme D): Loop subdivision into levels, stepping between them,
 * and detail kept per level.
 *
 * `.mesh.bin` holds triangles only (converted and SDF-baked meshes are all-triangle), so subdivision is
 * Loop's scheme. Each level above the base stores its **detail** — its positions minus the smooth
 * subdivision of the level below — so sculpting a lower level and stepping back up re-applies the fine
 * detail on top of the changed form instead of discarding it. Details are kept in the mesh's own space,
 * not a tangent frame: a large change at a low level carries the detail along without re-orienting it.
 */

/** The fixed topology from one level to the next: the child's triangles and how each child vertex is made. */
export type SubdivTopology = {
  parentVertices: number;
  /** The child's triangles. */
  indices: Uint32Array;
  /** For each edge (child vertex `parentVertices + e`): its ends and the opposite corners (`-1` on a border). */
  edgeA: Uint32Array;
  edgeB: Uint32Array;
  edgeC: Int32Array;
  edgeD: Int32Array;
  /** Parent vertex one-rings (CSR) and whether each parent vertex is on a border (then its two border neighbours). */
  ringStart: Uint32Array;
  ringList: Uint32Array;
  border: Int32Array;
};

/** Most vertices a subdivision may produce — the `.mesh.bin` ceiling. */
export const MULTIRES_MAX_VERTICES = 4_000_000;

/** Builds the Loop topology for a triangle mesh with `vertexCount` vertices. */
export function buildSubdivision(vertexCount: number, indices: Uint32Array): SubdivTopology {
  const triCount = indices.length / 3;
  const edgeOf = new Map<number, number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeC: number[] = [];
  const edgeD: number[] = [];
  const triEdges = new Uint32Array(triCount * 3);
  for (let t = 0; t < triCount; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = indices[t * 3 + k]!;
      const b = indices[t * 3 + ((k + 1) % 3)]!;
      const c = indices[t * 3 + ((k + 2) % 3)]!;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = lo * vertexCount + hi;
      let e = edgeOf.get(key);
      if (e === undefined) {
        e = edgeA.length;
        edgeOf.set(key, e);
        edgeA.push(lo);
        edgeB.push(hi);
        edgeC.push(c);
        edgeD.push(-1);
      } else if (edgeD[e] === -1) edgeD[e] = c;
      triEdges[t * 3 + k] = e;
    }
  }
  const out = new Uint32Array(triCount * 12);
  for (let t = 0; t < triCount; t += 1) {
    const v0 = indices[t * 3]!;
    const v1 = indices[t * 3 + 1]!;
    const v2 = indices[t * 3 + 2]!;
    const m01 = vertexCount + triEdges[t * 3]!;
    const m12 = vertexCount + triEdges[t * 3 + 1]!;
    const m20 = vertexCount + triEdges[t * 3 + 2]!;
    out.set([v0, m01, m20, v1, m12, m01, v2, m20, m12, m01, m12, m20], t * 12);
  }
  // One-rings from the edges; border vertices remember their two border neighbours.
  const counts = new Uint32Array(vertexCount + 1);
  for (let e = 0; e < edgeA.length; e += 1) {
    counts[edgeA[e]! + 1] = counts[edgeA[e]! + 1]! + 1;
    counts[edgeB[e]! + 1] = counts[edgeB[e]! + 1]! + 1;
  }
  for (let v = 0; v < vertexCount; v += 1) counts[v + 1] = counts[v + 1]! + counts[v]!;
  const ringList = new Uint32Array(edgeA.length * 2);
  const fill = counts.slice(0, vertexCount);
  const border = new Int32Array(vertexCount * 2).fill(-1);
  for (let e = 0; e < edgeA.length; e += 1) {
    const a = edgeA[e]!;
    const b = edgeB[e]!;
    ringList[fill[a]!] = b;
    fill[a] = fill[a]! + 1;
    ringList[fill[b]!] = a;
    fill[b] = fill[b]! + 1;
    if (edgeD[e] === -1) {
      for (const [v, u] of [
        [a, b],
        [b, a],
      ] as const) {
        if (border[v * 2] === -1) border[v * 2] = u;
        else if (border[v * 2 + 1] === -1) border[v * 2 + 1] = u;
      }
    }
  }
  return {
    parentVertices: vertexCount,
    indices: out,
    edgeA: Uint32Array.from(edgeA),
    edgeB: Uint32Array.from(edgeB),
    edgeC: Int32Array.from(edgeC),
    edgeD: Int32Array.from(edgeD),
    ringStart: counts,
    ringList,
    border,
  };
}

/** The smooth (Loop) child positions of `parent` on `topo`. */
export function subdividePositions(topo: SubdivTopology, parent: Float32Array): Float32Array {
  const n = topo.parentVertices;
  const out = new Float32Array((n + topo.edgeA.length) * 3);
  for (let v = 0; v < n; v += 1) {
    const at = v * 3;
    const b0 = topo.border[v * 2]!;
    const b1 = topo.border[v * 2 + 1]!;
    if (b0 >= 0 && b1 >= 0) {
      for (let k = 0; k < 3; k += 1) out[at + k] = 0.75 * parent[at + k]! + 0.125 * (parent[b0 * 3 + k]! + parent[b1 * 3 + k]!);
      continue;
    }
    const start = topo.ringStart[v]!;
    const end = topo.ringStart[v + 1]!;
    const valence = end - start;
    if (valence === 0) {
      for (let k = 0; k < 3; k += 1) out[at + k] = parent[at + k]!;
      continue;
    }
    const beta = valence === 3 ? 3 / 16 : 3 / (8 * valence);
    for (let k = 0; k < 3; k += 1) {
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += parent[topo.ringList[i]! * 3 + k]!;
      out[at + k] = (1 - valence * beta) * parent[at + k]! + beta * sum;
    }
  }
  for (let e = 0; e < topo.edgeA.length; e += 1) {
    const at = (n + e) * 3;
    const a = topo.edgeA[e]! * 3;
    const b = topo.edgeB[e]! * 3;
    const d = topo.edgeD[e]!;
    if (d < 0) {
      for (let k = 0; k < 3; k += 1) out[at + k] = 0.5 * (parent[a + k]! + parent[b + k]!);
    } else {
      const c = topo.edgeC[e]! * 3;
      for (let k = 0; k < 3; k += 1) out[at + k] = 0.375 * (parent[a + k]! + parent[b + k]!) + 0.125 * (parent[c + k]! + parent[d * 3 + k]!);
    }
  }
  return out;
}

/** A per-vertex attribute carried to the child: corners keep theirs, an edge vertex takes its first end's (groups) or the mean (mask). */
export function subdivideGroups(topo: SubdivTopology, groups: Uint16Array): Uint16Array {
  const out = new Uint16Array(topo.parentVertices + topo.edgeA.length);
  out.set(groups);
  for (let e = 0; e < topo.edgeA.length; e += 1) out[topo.parentVertices + e] = groups[topo.edgeA[e]!]!;
  return out;
}

export function subdivideMask(topo: SubdivTopology, mask: Float32Array): Float32Array {
  const out = new Float32Array(topo.parentVertices + topo.edgeA.length);
  out.set(mask);
  for (let e = 0; e < topo.edgeA.length; e += 1) out[topo.parentVertices + e] = 0.5 * (mask[topo.edgeA[e]!]! + mask[topo.edgeB[e]!]!);
  return out;
}

export type MultiresLevel = {
  positions: Float32Array;
  indices: Uint32Array;
  mask: Float32Array;
  groups?: Uint16Array;
  /** Detail over the smooth subdivision of the level below (`null` on the base). */
  detail: Float32Array | null;
  /** The topology up to the next level, once there is one. */
  up: SubdivTopology | null;
};

/** The stack of levels; level numbers count from `baseLevel` (what the loaded file recorded). */
export class Multires {
  levels: MultiresLevel[];
  current = 0;

  constructor(
    base: { positions: Float32Array; indices: Uint32Array; mask?: Float32Array; groups?: Uint16Array },
    readonly baseLevel = 0,
  ) {
    this.levels = [{ positions: base.positions, indices: base.indices, mask: base.mask ?? new Float32Array(base.positions.length / 3), ...(base.groups ? { groups: base.groups } : {}), detail: null, up: null }];
  }

  get level(): MultiresLevel {
    return this.levels[this.current]!;
  }

  /** The level number a file would record. */
  get levelNumber(): number {
    return this.baseLevel + this.current;
  }

  get top(): number {
    return this.levels.length - 1;
  }

  /** Adds a level above the top one (sculpting continues on it). Throws past the vertex ceiling. */
  subdivide(maxVertices = MULTIRES_MAX_VERTICES): void {
    if (this.current !== this.top) this.setLevel(this.top);
    const level = this.level;
    const vertices = level.positions.length / 3;
    const topo = level.up ?? buildSubdivision(vertices, level.indices);
    const childVertices = topo.parentVertices + topo.edgeA.length;
    if (childVertices > maxVertices) throw new Error(`Subdividing would make ${childVertices.toLocaleString()} vertices; the most a sculpt mesh holds is ${maxVertices.toLocaleString()}.`);
    level.up = topo;
    this.levels.push({
      positions: subdividePositions(topo, level.positions),
      indices: topo.indices,
      mask: subdivideMask(topo, level.mask),
      ...(level.groups ? { groups: subdivideGroups(topo, level.groups) } : {}),
      detail: new Float32Array(childVertices * 3),
      up: null,
    });
    this.current = this.top;
  }

  /**
   * Steps to level `target` (an index into `levels`). Leaving a level above the base first records its
   * detail; climbing rebuilds each level as the smooth subdivision of the one below plus its detail.
   */
  setLevel(target: number): void {
    if (target < 0 || target > this.top) throw new Error(`There is no multires level ${this.baseLevel + target}.`);
    if (target === this.current) return;
    this.recordDetail(this.current);
    for (let l = this.current + 1; l <= target; l += 1) {
      const below = this.levels[l - 1]!;
      const level = this.levels[l]!;
      const smooth = subdividePositions(below.up!, below.positions);
      const detail = level.detail!;
      for (let i = 0; i < smooth.length; i += 1) level.positions[i] = smooth[i]! + detail[i]!;
    }
    this.current = target;
  }

  private recordDetail(l: number): void {
    if (l === 0) return;
    const below = this.levels[l - 1]!;
    const level = this.levels[l]!;
    const smooth = subdividePositions(below.up!, below.positions);
    const detail = level.detail ?? new Float32Array(smooth.length);
    for (let i = 0; i < smooth.length; i += 1) detail[i] = level.positions[i]! - smooth[i]!;
    level.detail = detail;
  }

  /** A deep copy (positions, masks and details; topology is immutable and shared) — an undo snapshot. */
  snapshot(): MultiresSnapshot {
    return {
      current: this.current,
      baseLevel: this.baseLevel,
      levels: this.levels.map((l) => ({ ...l, positions: l.positions.slice(), mask: l.mask.slice(), detail: l.detail ? l.detail.slice() : null })),
    };
  }

  static restore(snapshot: MultiresSnapshot): Multires {
    const first = snapshot.levels[0]!;
    const m = new Multires({ positions: first.positions, indices: first.indices, mask: first.mask, ...(first.groups ? { groups: first.groups } : {}) }, snapshot.baseLevel);
    m.levels = snapshot.levels.map((l) => ({ ...l, positions: l.positions.slice(), mask: l.mask.slice(), detail: l.detail ? l.detail.slice() : null }));
    m.current = snapshot.current;
    return m;
  }
}

export type MultiresSnapshot = { current: number; baseLevel: number; levels: MultiresLevel[] };
