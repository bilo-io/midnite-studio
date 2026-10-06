/**
 * A bounding-volume hierarchy over a mesh's triangles (Phase 104 Theme A) — what brush hits and
 * raycasts query instead of testing every triangle.
 *
 * Flat typed arrays, no objects per node: node `n` has its box at `bounds[n*6 .. n*6+6)` (min xyz, max
 * xyz); a leaf holds `count > 0` triangles at `order[offset .. offset+count)`, an inner node holds
 * `count = 0` and its children at `n + 1` (left) and `right[n]`. Built by median split on the longest
 * axis of the centroid box. After a stroke moves vertices, {@link Bvh.refit} recomputes the boxes
 * bottom-up without rebuilding the tree — the topology is unchanged, only the boxes grow or shrink.
 */

const LEAF_SIZE = 8;

export type RayHit = { triangle: number; distance: number; point: [number, number, number]; barycentric: [number, number, number] };

export class Bvh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  bounds: Float32Array;
  offset: Uint32Array;
  count: Uint32Array;
  right: Uint32Array;
  /** Triangle ids in leaf order. */
  order: Uint32Array;
  nodeCount = 0;

  constructor(positions: Float32Array, indices: Uint32Array) {
    this.positions = positions;
    this.indices = indices;
    const triangles = indices.length / 3;
    // Median splits leave every leaf at least LEAF_SIZE/2 triangles (or the whole mesh), which bounds the node count.
    const maxNodes = 2 * Math.ceil(triangles / (LEAF_SIZE / 2)) + 1;
    this.bounds = new Float32Array(maxNodes * 6);
    this.offset = new Uint32Array(maxNodes);
    this.count = new Uint32Array(maxNodes);
    this.right = new Uint32Array(maxNodes);
    this.order = new Uint32Array(triangles);
    for (let t = 0; t < triangles; t += 1) this.order[t] = t;
    const centroids = new Float32Array(triangles * 3);
    for (let t = 0; t < triangles; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        centroids[t * 3 + k] =
          (positions[indices[t * 3]! * 3 + k]! + positions[indices[t * 3 + 1]! * 3 + k]! + positions[indices[t * 3 + 2]! * 3 + k]!) / 3;
      }
    }
    if (triangles > 0) this.build(0, triangles, centroids);
    this.bounds = this.bounds.slice(0, this.nodeCount * 6);
    this.offset = this.offset.slice(0, this.nodeCount);
    this.count = this.count.slice(0, this.nodeCount);
    this.right = this.right.slice(0, this.nodeCount);
  }

  get triangleCount(): number {
    return this.order.length;
  }

  private build(start: number, end: number, centroids: Float32Array): number {
    const node = this.nodeCount;
    this.nodeCount += 1;
    this.boxOf(node, start, end);
    const n = end - start;
    if (n <= LEAF_SIZE) {
      this.offset[node] = start;
      this.count[node] = n;
      return node;
    }
    // Longest axis of the centroid box.
    const cmin = [Infinity, Infinity, Infinity];
    const cmax = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i += 1) {
      const t = this.order[i]!;
      for (let k = 0; k < 3; k += 1) {
        const c = centroids[t * 3 + k]!;
        if (c < cmin[k]!) cmin[k] = c;
        if (c > cmax[k]!) cmax[k] = c;
      }
    }
    const extent = [cmax[0]! - cmin[0]!, cmax[1]! - cmin[1]!, cmax[2]! - cmin[2]!];
    const axis = extent[0]! >= extent[1]! && extent[0]! >= extent[2]! ? 0 : extent[1]! >= extent[2]! ? 1 : 2;
    const mid = start + (n >> 1);
    selectNth(this.order, start, end - 1, mid, centroids, axis);
    this.count[node] = 0;
    this.build(start, mid, centroids);
    this.right[node] = this.build(mid, end, centroids);
    return node;
  }

  private boxOf(node: number, start: number, end: number): void {
    const b = node * 6;
    this.bounds[b] = this.bounds[b + 1] = this.bounds[b + 2] = Infinity;
    this.bounds[b + 3] = this.bounds[b + 4] = this.bounds[b + 5] = -Infinity;
    for (let i = start; i < end; i += 1) this.growByTriangle(b, this.order[i]!);
  }

  private growByTriangle(b: number, t: number): void {
    for (let corner = 0; corner < 3; corner += 1) {
      const v = this.indices[t * 3 + corner]! * 3;
      for (let k = 0; k < 3; k += 1) {
        const value = this.positions[v + k]!;
        if (value < this.bounds[b + k]!) this.bounds[b + k] = value;
        if (value > this.bounds[b + 3 + k]!) this.bounds[b + 3 + k] = value;
      }
    }
  }

  /** Recomputes every box from the current vertex positions, children before parents (nodes are pre-order). */
  refit(): void {
    for (let node = this.nodeCount - 1; node >= 0; node -= 1) {
      const b = node * 6;
      if (this.count[node]! > 0) {
        this.boxOf(node, this.offset[node]!, this.offset[node]! + this.count[node]!);
        continue;
      }
      const l = (node + 1) * 6;
      const r = this.right[node]! * 6;
      for (let k = 0; k < 3; k += 1) {
        this.bounds[b + k] = Math.min(this.bounds[l + k]!, this.bounds[r + k]!);
        this.bounds[b + 3 + k] = Math.max(this.bounds[l + 3 + k]!, this.bounds[r + 3 + k]!);
      }
    }
  }

  /** The nearest triangle the ray `origin + t·dir` (t ≥ 0) hits, or `null`. Both faces count. */
  raycast(origin: readonly [number, number, number], dir: readonly [number, number, number], maxDistance = Infinity): RayHit | null {
    if (this.nodeCount === 0) return null;
    const inv = [1 / dir[0], 1 / dir[1], 1 / dir[2]];
    let best: RayHit | null = null;
    let bestT = maxDistance;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!this.rayHitsBox(node, origin, inv, bestT)) continue;
      const count = this.count[node]!;
      if (count > 0) {
        const offset = this.offset[node]!;
        for (let i = offset; i < offset + count; i += 1) {
          const t = this.order[i]!;
          const hit = intersectTriangle(this.positions, this.indices, t, origin, dir);
          if (hit && hit.distance < bestT) {
            bestT = hit.distance;
            best = hit;
          }
        }
      } else {
        stack.push(this.right[node]!, node + 1);
      }
    }
    return best;
  }

  /** Triangles whose box overlaps the sphere — a conservative brush footprint, sorted. */
  trianglesNearSphere(center: readonly [number, number, number], radius: number): number[] {
    const out: number[] = [];
    if (this.nodeCount === 0) return out;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!this.sphereHitsBox(node * 6, center, radius)) continue;
      const count = this.count[node]!;
      if (count > 0) {
        const offset = this.offset[node]!;
        for (let i = offset; i < offset + count; i += 1) out.push(this.order[i]!);
      } else stack.push(this.right[node]!, node + 1);
    }
    return out.sort((a, b) => a - b);
  }

  /** Vertices within `radius` of `center` — what a brush dab moves. Sorted, each once. */
  verticesInSphere(center: readonly [number, number, number], radius: number): number[] {
    const r2 = radius * radius;
    const seen = new Set<number>();
    for (const t of this.trianglesNearSphere(center, radius)) {
      for (let k = 0; k < 3; k += 1) {
        const v = this.indices[t * 3 + k]!;
        if (seen.has(v)) continue;
        const dx = this.positions[v * 3]! - center[0];
        const dy = this.positions[v * 3 + 1]! - center[1];
        const dz = this.positions[v * 3 + 2]! - center[2];
        if (dx * dx + dy * dy + dz * dz <= r2) seen.add(v);
      }
    }
    return [...seen].sort((a, b) => a - b);
  }

  private rayHitsBox(node: number, origin: readonly number[], inv: readonly number[], maxT: number): boolean {
    const b = node * 6;
    let tmin = 0;
    let tmax = maxT;
    for (let k = 0; k < 3; k += 1) {
      let t1 = (this.bounds[b + k]! - origin[k]!) * inv[k]!;
      let t2 = (this.bounds[b + 3 + k]! - origin[k]!) * inv[k]!;
      if (Number.isNaN(t1) || Number.isNaN(t2)) {
        // Ray parallel to the slab and starting on its plane: inside along this axis.
        if (origin[k]! < this.bounds[b + k]! || origin[k]! > this.bounds[b + 3 + k]!) return false;
        continue;
      }
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    return true;
  }

  private sphereHitsBox(b: number, c: readonly number[], radius: number): boolean {
    let d2 = 0;
    for (let k = 0; k < 3; k += 1) {
      const v = c[k]!;
      const lo = this.bounds[b + k]!;
      const hi = this.bounds[b + 3 + k]!;
      if (v < lo) d2 += (lo - v) ** 2;
      else if (v > hi) d2 += (v - hi) ** 2;
    }
    return d2 <= radius * radius;
  }
}

/** Quickselect: reorders `order[lo..hi]` so `order[k]` is the k-th by centroid on `axis`, smaller ones before it. */
function selectNth(order: Uint32Array, lo: number, hi: number, k: number, centroids: Float32Array, axis: number): void {
  const key = (i: number): number => centroids[order[i]! * 3 + axis]!;
  const swap = (i: number, j: number): void => {
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  };
  while (lo < hi) {
    const pivot = key((lo + hi) >> 1);
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (key(i) < pivot) i += 1;
      while (key(j) > pivot) j -= 1;
      if (i <= j) {
        swap(i, j);
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return;
  }
}

/** Möller–Trumbore, two-sided. Exported so tests can brute-force against the tree. */
export function intersectTriangle(
  positions: Float32Array,
  indices: Uint32Array,
  t: number,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
): RayHit | null {
  const a = indices[t * 3]! * 3;
  const b = indices[t * 3 + 1]! * 3;
  const c = indices[t * 3 + 2]! * 3;
  const e1 = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!];
  const e2 = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!];
  const p = [dir[1] * e2[2]! - dir[2] * e2[1]!, dir[2] * e2[0]! - dir[0] * e2[2]!, dir[0] * e2[1]! - dir[1] * e2[0]!];
  const det = e1[0]! * p[0]! + e1[1]! * p[1]! + e1[2]! * p[2]!;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const s = [origin[0] - positions[a]!, origin[1] - positions[a + 1]!, origin[2] - positions[a + 2]!];
  const u = (s[0]! * p[0]! + s[1]! * p[1]! + s[2]! * p[2]!) * invDet;
  if (u < 0 || u > 1) return null;
  const q = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
  const v = (dir[0] * q[0]! + dir[1] * q[1]! + dir[2] * q[2]!) * invDet;
  if (v < 0 || u + v > 1) return null;
  const distance = (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) * invDet;
  if (distance < 0) return null;
  return {
    triangle: t,
    distance,
    point: [origin[0] + dir[0] * distance, origin[1] + dir[1] * distance, origin[2] + dir[2] * distance],
    barycentric: [1 - u - v, u, v],
  };
}
