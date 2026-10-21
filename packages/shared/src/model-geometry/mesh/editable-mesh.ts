/**
 * The editable mesh behind a `sculpt` part (Phase 104 Theme A).
 *
 * Primitives are rebuilt from their parameters on every change; a sculpted mesh is the data itself,
 * so it lives in flat typed arrays sized for about a million vertices: `positions` and `normals` are
 * xyz triples, `indices` triangle corners. Vertex→face adjacency is a CSR pair (`faceStart`/`faceList`)
 * built once per topology, so a brush that moves a few hundred vertices recomputes the normals of only
 * those vertices and their one-ring — the dirty set — instead of the whole mesh.
 *
 * Pure TS, no three: it runs in the renderer's sculpt worker, in main and under bare vitest alike.
 */

export type MeshArrays = { positions: Float32Array; normals?: Float32Array; indices: Uint32Array };

/** A contiguous run of changed vertices `[start, end)` and their new data — what the worker posts to the renderer. */
export type MeshDelta = { start: number; end: number; positions: Float32Array; normals: Float32Array };

export class EditableMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** `faceList[faceStart[v] .. faceStart[v + 1])` are the triangles that use vertex `v`. */
  faceStart: Uint32Array;
  faceList: Uint32Array;
  private readonly dirty = new Set<number>();

  constructor(arrays: MeshArrays) {
    if (arrays.positions.length % 3 !== 0) throw new Error('positions must hold xyz triples.');
    if (arrays.indices.length % 3 !== 0) throw new Error('indices must hold whole triangles.');
    const vertexCount = arrays.positions.length / 3;
    for (let i = 0; i < arrays.indices.length; i += 1) {
      if (arrays.indices[i]! >= vertexCount) throw new Error(`Triangle corner ${i} uses vertex ${arrays.indices[i]}, but there are only ${vertexCount}.`);
    }
    this.positions = arrays.positions;
    this.indices = arrays.indices;
    const adjacency = buildAdjacency(vertexCount, arrays.indices);
    this.faceStart = adjacency.faceStart;
    this.faceList = adjacency.faceList;
    if (arrays.normals && arrays.normals.length === arrays.positions.length) this.normals = arrays.normals;
    else {
      this.normals = new Float32Array(arrays.positions.length);
      this.recomputeAllNormals();
    }
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get faceCount(): number {
    return this.indices.length / 3;
  }

  /** The triangles around vertex `v`. */
  facesOf(v: number): Uint32Array {
    return this.faceList.subarray(this.faceStart[v]!, this.faceStart[v + 1]!);
  }

  /** The vertices sharing a triangle with `v` (its one-ring), without `v` itself. */
  neighbours(v: number): number[] {
    const out = new Set<number>();
    for (const f of this.facesOf(v)) {
      for (let k = 0; k < 3; k += 1) {
        const u = this.indices[f * 3 + k]!;
        if (u !== v) out.add(u);
      }
    }
    return [...out];
  }

  /** Moves vertex `v` and marks it dirty. */
  setPosition(v: number, x: number, y: number, z: number): void {
    this.positions[v * 3] = x;
    this.positions[v * 3 + 1] = y;
    this.positions[v * 3 + 2] = z;
    this.dirty.add(v);
  }

  markDirty(v: number): void {
    this.dirty.add(v);
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  /**
   * Recomputes normals where geometry changed: every vertex of every triangle touching a dirty vertex
   * (a moved vertex tilts its neighbours' faces too). Clears the dirty set; returns the vertices whose
   * normals were rewritten, sorted.
   */
  updateNormals(): number[] {
    if (this.dirty.size === 0) return [];
    const touched = new Set<number>();
    for (const v of this.dirty) {
      touched.add(v);
      for (const f of this.facesOf(v)) for (let k = 0; k < 3; k += 1) touched.add(this.indices[f * 3 + k]!);
    }
    this.dirty.clear();
    const out = [...touched].sort((a, b) => a - b);
    for (const v of out) this.vertexNormal(v);
    return out;
  }

  /**
   * Normals for the dirty region, then one delta spanning every changed vertex — the range the renderer
   * re-uploads with `addUpdateRange`. `null` when nothing changed.
   */
  takeDelta(): MeshDelta | null {
    const changed = this.updateNormals();
    if (changed.length === 0) return null;
    const start = changed[0]!;
    const end = changed[changed.length - 1]! + 1;
    return { start, end, positions: this.positions.slice(start * 3, end * 3), normals: this.normals.slice(start * 3, end * 3) };
  }

  /** Writes a delta from elsewhere (the worker's copy) into this mesh. */
  applyDelta(delta: MeshDelta): void {
    this.positions.set(delta.positions, delta.start * 3);
    this.normals.set(delta.normals, delta.start * 3);
  }

  recomputeAllNormals(): void {
    for (let v = 0; v < this.vertexCount; v += 1) this.vertexNormal(v);
    this.dirty.clear();
  }

  /** Edges used by exactly one triangle, as `[a, b]` with `a < b` — empty for a closed (watertight) mesh. */
  boundaryEdges(): [number, number][] {
    const counts = new Map<number, number>();
    const n = this.vertexCount;
    for (let f = 0; f < this.faceCount; f += 1) {
      for (let k = 0; k < 3; k += 1) {
        const a = this.indices[f * 3 + k]!;
        const b = this.indices[f * 3 + ((k + 1) % 3)]!;
        const key = a < b ? a * n + b : b * n + a;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const out: [number, number][] = [];
    for (const [key, count] of counts) if (count === 1) out.push([Math.floor(key / n), key % n]);
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }

  isClosed(): boolean {
    return this.boundaryEdges().length === 0;
  }

  bounds(): { min: [number, number, number]; max: [number, number, number] } {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const value = this.positions[i + k]!;
        if (value < min[k]!) min[k] = value;
        if (value > max[k]!) max[k] = value;
      }
    }
    return { min, max };
  }

  /** Area-weighted average of the face normals around `v`. */
  private vertexNormal(v: number): void {
    const p = this.positions;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const f of this.facesOf(v)) {
      const a = this.indices[f * 3]! * 3;
      const b = this.indices[f * 3 + 1]! * 3;
      const c = this.indices[f * 3 + 2]! * 3;
      const e1x = p[b]! - p[a]!;
      const e1y = p[b + 1]! - p[a + 1]!;
      const e1z = p[b + 2]! - p[a + 2]!;
      const e2x = p[c]! - p[a]!;
      const e2y = p[c + 1]! - p[a + 1]!;
      const e2z = p[c + 2]! - p[a + 2]!;
      nx += e1y * e2z - e1z * e2y;
      ny += e1z * e2x - e1x * e2z;
      nz += e1x * e2y - e1y * e2x;
    }
    const len = Math.hypot(nx, ny, nz);
    const at = v * 3;
    if (len > 0) {
      this.normals[at] = nx / len;
      this.normals[at + 1] = ny / len;
      this.normals[at + 2] = nz / len;
    } else {
      this.normals[at] = 0;
      this.normals[at + 1] = 1;
      this.normals[at + 2] = 0;
    }
  }
}

/** CSR vertex→face adjacency: a count pass, a prefix sum, then a fill pass. */
export function buildAdjacency(vertexCount: number, indices: Uint32Array): { faceStart: Uint32Array; faceList: Uint32Array } {
  const faceStart = new Uint32Array(vertexCount + 1);
  for (let i = 0; i < indices.length; i += 1) faceStart[indices[i]! + 1] = faceStart[indices[i]! + 1]! + 1;
  for (let v = 0; v < vertexCount; v += 1) faceStart[v + 1] = faceStart[v + 1]! + faceStart[v]!;
  const faceList = new Uint32Array(indices.length);
  const fill = faceStart.slice(0, vertexCount);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i]!;
    faceList[fill[v]!] = Math.floor(i / 3);
    fill[v] = fill[v]! + 1;
  }
  return { faceStart, faceList };
}
