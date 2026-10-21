import { Bvh } from '../mesh/bvh';
import { EditableMesh } from '../mesh/editable-mesh';

/**
 * The surface a paint brush lands on (Phase 104 Theme G): an unwrapped mesh, its BVH, and — per texture
 * size — a **texel map** that says which triangle every texel belongs to.
 *
 * The map is built by rasterising each triangle in uv space, then dilating `padding` texels into the gutter,
 * each gutter texel taking the triangle of the covered texel next to it. A brush works texel by texel through
 * that map: a texel's surface point is its triangle's barycentric interpolation at the texel centre —
 * **extrapolated** for a gutter texel, so paint near a chart's border runs on past it into the gutter. That
 * is the seam bleed: filtering and mip-mapping across a uv seam read paint, not the background.
 *
 * Seams are split vertices (Theme F's unwrap), so triangles that share a vertex index lie in one uv chart;
 * {@link PaintSurface.charts} groups them for the island fill.
 */
export type PaintMesh = { positions: Float32Array; indices: Uint32Array; uvs: Float32Array; normals?: Float32Array };
type V3 = [number, number, number];

/** Gutter texels a map dilates into. */
export const PAINT_PADDING = 4;

export type TexelMap = {
  size: number;
  /** Triangle per texel, `-1` where no chart reaches even after dilation. */
  triangle: Int32Array;
  /** 1 where the texel centre is inside its triangle (not a gutter texel). */
  inside: Uint8Array;
};

export class PaintSurface {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly uvs: Float32Array;
  readonly bvh: Bvh;
  /** Chart (uv island) per triangle. */
  readonly charts: Int32Array;
  readonly chartCount: number;
  private readonly maps = new Map<number, TexelMap>();

  constructor(mesh: PaintMesh) {
    if (mesh.uvs.length !== (mesh.positions.length / 3) * 2) throw new Error('The mesh has no uv layout — unwrap it first.');
    const editable = new EditableMesh({ positions: mesh.positions, indices: mesh.indices, ...(mesh.normals ? { normals: mesh.normals } : {}) });
    this.positions = editable.positions;
    this.normals = editable.normals;
    this.indices = editable.indices;
    this.uvs = mesh.uvs;
    this.bvh = new Bvh(this.positions, this.indices);
    const { charts, count } = triangleCharts(this.positions.length / 3, this.indices);
    this.charts = charts;
    this.chartCount = count;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  /** The texel map at `size`, built once and cached. */
  texelMap(size: number): TexelMap {
    const hit = this.maps.get(size);
    if (hit) return hit;
    const map = buildTexelMap(this.indices, this.uvs, size, PAINT_PADDING);
    this.maps.set(size, map);
    return map;
  }

  /** Barycentric weights of texel centre `(x, y)` in triangle `t` at `size` (they may be negative outside it). */
  barycentric(t: number, size: number, x: number, y: number, out: number[] = [0, 0, 0]): number[] {
    const i = this.indices;
    const uv = this.uvs;
    const a = i[t * 3]!;
    const b = i[t * 3 + 1]!;
    const c = i[t * 3 + 2]!;
    const ax = uv[a * 2]! * size;
    const ay = uv[a * 2 + 1]! * size;
    const bx = uv[b * 2]! * size;
    const by = uv[b * 2 + 1]! * size;
    const cx = uv[c * 2]! * size;
    const cy = uv[c * 2 + 1]! * size;
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const px = x + 0.5;
    const py = y + 0.5;
    if (Math.abs(denom) < 1e-12) {
      out[0] = 1 / 3;
      out[1] = 1 / 3;
      out[2] = 1 / 3;
      return out;
    }
    out[0] = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
    out[1] = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
    out[2] = 1 - out[0] - out[1];
    return out;
  }

  /** Interpolates a per-vertex attribute (3 components) of triangle `t` at `bary`. */
  interpolate(attribute: Float32Array, t: number, bary: readonly number[], out: number[] = [0, 0, 0]): number[] {
    const i = this.indices;
    const a = i[t * 3]! * 3;
    const b = i[t * 3 + 1]! * 3;
    const c = i[t * 3 + 2]! * 3;
    for (let k = 0; k < 3; k += 1) out[k] = bary[0]! * attribute[a + k]! + bary[1]! * attribute[b + k]! + bary[2]! * attribute[c + k]!;
    return out;
  }

  /** The uv at barycentric `bary` of triangle `t`. */
  uvAt(t: number, bary: readonly number[]): [number, number] {
    const i = this.indices;
    const uv = this.uvs;
    const a = i[t * 3]!;
    const b = i[t * 3 + 1]!;
    const c = i[t * 3 + 2]!;
    return [bary[0]! * uv[a * 2]! + bary[1]! * uv[b * 2]! + bary[2]! * uv[c * 2]!, bary[0]! * uv[a * 2 + 1]! + bary[1]! * uv[b * 2 + 1]! + bary[2]! * uv[c * 2 + 1]!];
  }

  /** The first surface hit along a ray, with its triangle, uv and normal. */
  raycast(origin: V3, dir: V3): { triangle: number; point: V3; normal: V3; uv: [number, number] } | null {
    const hit = this.bvh.raycast(origin, dir);
    if (!hit) return null;
    const normal = this.interpolate(this.normals, hit.triangle, hit.barycentric) as V3;
    const l = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    return { triangle: hit.triangle, point: hit.point, normal: [normal[0] / l, normal[1] / l, normal[2] / l], uv: this.uvAt(hit.triangle, hit.barycentric) };
  }

  /** The nearest surface point to `p`, with its triangle and uv. */
  closest(p: V3, maxDistance = Infinity): { triangle: number; point: V3; uv: [number, number] } | null {
    const hit = this.bvh.closestPoint(p, maxDistance);
    if (!hit) return null;
    return { triangle: hit.triangle, point: hit.point, uv: this.uvAt(hit.triangle, hit.barycentric) };
  }
}

/** Union-find over triangles that share a vertex: each group is one uv chart (seams are split vertices). */
export function triangleCharts(vertexCount: number, indices: Uint32Array): { charts: Int32Array; count: number } {
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let f = 0; f < indices.length; f += 3) {
    union(indices[f]!, indices[f + 1]!);
    union(indices[f]!, indices[f + 2]!);
  }
  const ids = new Map<number, number>();
  const charts = new Int32Array(indices.length / 3);
  for (let t = 0; t < charts.length; t += 1) {
    const root = find(indices[t * 3]!);
    let id = ids.get(root);
    if (id === undefined) {
      id = ids.size;
      ids.set(root, id);
    }
    charts[t] = id;
  }
  return { charts, count: ids.size };
}

/** Rasterises every triangle's uv footprint at `size`, then dilates `padding` texels into the gutter. */
export function buildTexelMap(indices: Uint32Array, uvs: Float32Array, size: number, padding: number): TexelMap {
  const triangle = new Int32Array(size * size).fill(-1);
  const inside = new Uint8Array(size * size);
  for (let t = 0; t < indices.length / 3; t += 1) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    const ax = uvs[a * 2]! * size;
    const ay = uvs[a * 2 + 1]! * size;
    const bx = uvs[b * 2]! * size;
    const by = uvs[b * 2 + 1]! * size;
    const cx = uvs[c * 2]! * size;
    const cy = uvs[c * 2 + 1]! * size;
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
        const l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const at = y * size + x;
        if (inside[at]) continue;
        inside[at] = 1;
        triangle[at] = t;
      }
    }
  }
  // Dilate: each pass, an empty texel takes a 4-neighbour's triangle.
  for (let pass = 0; pass < padding; pass += 1) {
    const before = triangle.slice();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const at = y * size + x;
        if (before[at]! >= 0) continue;
        if (x + 1 < size && before[at + 1]! >= 0) triangle[at] = before[at + 1]!;
        else if (x > 0 && before[at - 1]! >= 0) triangle[at] = before[at - 1]!;
        else if (y + 1 < size && before[at + size]! >= 0) triangle[at] = before[at + size]!;
        else if (y > 0 && before[at - size]! >= 0) triangle[at] = before[at - size]!;
      }
    }
  }
  return { size, triangle, inside };
}
