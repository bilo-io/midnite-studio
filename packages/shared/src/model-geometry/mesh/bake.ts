import { Bvh } from './bvh';
import { EditableMesh } from './editable-mesh';

/**
 * Bakes from a high-resolution mesh onto a low-resolution, UV-mapped one (Phase 104 Theme F): a
 * tangent-space **normal map**, **ambient occlusion**, and **curvature** and **cavity** maps for texturing
 * (edge wear on the convex, dirt in the concave).
 *
 * Every texel of the low mesh's UV layout is a point on its surface. A ray is cast along the low normal from
 * a cage distance outside it, back at the high mesh, and whatever it hits supplies the detail: the high
 * normal (re-expressed in the low surface's tangent frame), an occlusion estimate from a fixed fan of rays,
 * and the vertex curvature there. Gutters are dilated so mip-mapping and filtering never sample the
 * background.
 *
 * **Tangent space.** The frame is the per-vertex one MikkTSpace-style bakers use on glTF assets — tangent =
 * d position / d u, bitangent = d position / d v with v flipped to point up the image (glTF's origin is
 * top-left), Gram-Schmidt against the vertex normal, handedness in the bitangent's sign, interpolated and
 * re-orthonormalised per texel. A glTF viewer rebuilds the same frame from the UVs (the exported `.glb`
 * carries no tangents), so a map baked here shades correctly there. Pixel `(x, y)` is uv `(x/size, y/size)`.
 */

export type BakeKind = 'normal' | 'ao' | 'curvature' | 'cavity';
export const BAKE_KINDS: readonly BakeKind[] = ['normal', 'ao', 'curvature', 'cavity'];
export const BAKE_SIZE_MIN = 64;
export const BAKE_SIZE_DEFAULT = 2048;
export const BAKE_SIZE_MAX = 4096;

export type BakeMesh = { positions: Float32Array; indices: Uint32Array; normals?: Float32Array };

export type BakeOptions = {
  high: BakeMesh;
  low: BakeMesh & { uvs: Float32Array };
  size?: number;
  kinds?: readonly BakeKind[];
  /** How far outside the low surface a ray starts, in model units (default 3% of its diagonal). */
  cage?: number;
  /** Occlusion rays per texel (default 12). */
  aoSamples?: number;
  /** How far an occlusion ray looks, in model units (default 25% of the diagonal). */
  aoDistance?: number;
  /** Gutter in texels (default 4). */
  padding?: number;
  /** Awaited between rows, so a long bake does not freeze the event loop. */
  yieldNow?: () => Promise<void>;
};

export type BakeResult = {
  size: number;
  /** RGB, `size × size × 3`. */
  normal?: Uint8Array;
  /** Grey, `size × size`: 255 = open, 0 = fully occluded. */
  ao?: Uint8Array;
  /** Grey: 128 = flat, brighter = convex. */
  curvature?: Uint8Array;
  /** Grey: 255 = flat or convex, darker = concave. */
  cavity?: Uint8Array;
  /** Share of texels the low mesh's UVs cover. */
  coverage: number;
  /** Share of covered texels whose ray found the high mesh. */
  hitRate: number;
};

type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-20 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};

/** Per-vertex tangent (xyz) and handedness (w) from the uv layout; v is flipped so the bitangent points up the image. */
export function vertexTangents(positions: Float32Array, normals: Float32Array, indices: Uint32Array, uvs: Float32Array): Float32Array {
  const n = positions.length / 3;
  const tan = new Float64Array(n * 3);
  const bit = new Float64Array(n * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f]!, indices[f + 1]!, indices[f + 2]!];
    const e1: V3 = [positions[b * 3]! - positions[a * 3]!, positions[b * 3 + 1]! - positions[a * 3 + 1]!, positions[b * 3 + 2]! - positions[a * 3 + 2]!];
    const e2: V3 = [positions[c * 3]! - positions[a * 3]!, positions[c * 3 + 1]! - positions[a * 3 + 1]!, positions[c * 3 + 2]! - positions[a * 3 + 2]!];
    const du1 = uvs[b * 2]! - uvs[a * 2]!;
    const dv1 = -(uvs[b * 2 + 1]! - uvs[a * 2 + 1]!);
    const du2 = uvs[c * 2]! - uvs[a * 2]!;
    const dv2 = -(uvs[c * 2 + 1]! - uvs[a * 2 + 1]!);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-18) continue;
    const r = 1 / det;
    const t: V3 = [(e1[0] * dv2 - e2[0] * dv1) * r, (e1[1] * dv2 - e2[1] * dv1) * r, (e1[2] * dv2 - e2[2] * dv1) * r];
    const bt: V3 = [(e2[0] * du1 - e1[0] * du2) * r, (e2[1] * du1 - e1[1] * du2) * r, (e2[2] * du1 - e1[2] * du2) * r];
    for (const v of [a, b, c]) {
      for (let k = 0; k < 3; k += 1) {
        tan[v * 3 + k] = tan[v * 3 + k]! + t[k]!;
        bit[v * 3 + k] = bit[v * 3 + k]! + bt[k]!;
      }
    }
  }
  const out = new Float32Array(n * 4);
  for (let v = 0; v < n; v += 1) {
    const nrm: V3 = [normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!];
    let t: V3 = [tan[v * 3]!, tan[v * 3 + 1]!, tan[v * 3 + 2]!];
    const d = dot(nrm, t);
    t = [t[0] - nrm[0] * d, t[1] - nrm[1] * d, t[2] - nrm[2] * d];
    if (Math.hypot(t[0], t[1], t[2]) < 1e-12) {
      // No usable uv derivative: any vector perpendicular to the normal.
      t = Math.abs(nrm[1]) < 0.9 ? cross([0, 1, 0], nrm) : cross([1, 0, 0], nrm);
    }
    t = norm(t);
    const w = dot(cross(nrm, t), [bit[v * 3]!, bit[v * 3 + 1]!, bit[v * 3 + 2]!]) < 0 ? -1 : 1;
    out.set([t[0], t[1], t[2], w], v * 4);
  }
  return out;
}

/** Signed mean curvature per vertex, positive on convex ridges: the umbrella Laplacian along the normal, over the mean edge length. */
export function vertexCurvature(mesh: EditableMesh): Float32Array {
  const n = mesh.vertexCount;
  const out = new Float32Array(n);
  const p = mesh.positions;
  for (let v = 0; v < n; v += 1) {
    const ring = mesh.neighbours(v);
    if (ring.length === 0) continue;
    let lx = 0;
    let ly = 0;
    let lz = 0;
    let edge = 0;
    for (const u of ring) {
      lx += p[u * 3]! - p[v * 3]!;
      ly += p[u * 3 + 1]! - p[v * 3 + 1]!;
      lz += p[u * 3 + 2]! - p[v * 3 + 2]!;
      edge += Math.hypot(p[u * 3]! - p[v * 3]!, p[u * 3 + 1]! - p[v * 3 + 1]!, p[u * 3 + 2]! - p[v * 3 + 2]!);
    }
    lx /= ring.length;
    ly /= ring.length;
    lz /= ring.length;
    edge /= ring.length;
    out[v] = edge > 0 ? -(lx * mesh.normals[v * 3]! + ly * mesh.normals[v * 3 + 1]! + lz * mesh.normals[v * 3 + 2]!) / edge : 0;
  }
  return out;
}

/** The Fibonacci hemisphere around +z, cosine-weighted, as a fixed fan of unit directions. */
function hemisphere(count: number): V3[] {
  const out: V3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const r = Math.sqrt((i + 0.5) / count);
    const phi = i * golden;
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - r * r))]);
  }
  return out;
}

const percentile = (values: Float32Array, q: number): number => {
  if (values.length === 0) return 1;
  const abs = Float32Array.from(values, Math.abs).sort();
  return abs[Math.min(abs.length - 1, Math.floor(abs.length * q))] || 1e-6;
};

export async function bakeMaps(options: BakeOptions): Promise<BakeResult> {
  const size = Math.min(BAKE_SIZE_MAX, Math.max(BAKE_SIZE_MIN, Math.round(options.size ?? BAKE_SIZE_DEFAULT)));
  const kinds = new Set(options.kinds ?? BAKE_KINDS);
  const padding = options.padding ?? 4;
  const { high, low } = options;

  const highMesh = new EditableMesh({ positions: high.positions, indices: high.indices, ...(high.normals ? { normals: high.normals } : {}) });
  const bvh = new Bvh(highMesh.positions, highMesh.indices);
  const lowMesh = new EditableMesh({ positions: low.positions, indices: low.indices, ...(low.normals ? { normals: low.normals } : {}) });
  const tangents = vertexTangents(lowMesh.positions, lowMesh.normals, lowMesh.indices, low.uvs);

  const bounds = lowMesh.bounds();
  const diagonal = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) || 1;
  const cage = options.cage ?? diagonal * 0.03;
  const aoDistance = options.aoDistance ?? diagonal * 0.25;
  const fan = hemisphere(Math.max(1, Math.round(options.aoSamples ?? 12)));
  const wantNormal = kinds.has('normal');
  const wantAo = kinds.has('ao');
  const wantCurv = kinds.has('curvature') || kinds.has('cavity');

  let curvature: Float32Array | null = null;
  let scale = 1;
  if (wantCurv) {
    curvature = vertexCurvature(highMesh);
    scale = percentile(curvature, 0.98);
  }

  const texels = size * size;
  const covered = new Uint8Array(texels);
  const normalMap = wantNormal ? new Uint8Array(texels * 3) : undefined;
  const aoMap = wantAo ? new Uint8Array(texels) : undefined;
  const curvMap = kinds.has('curvature') ? new Uint8Array(texels) : undefined;
  const cavityMap = kinds.has('cavity') ? new Uint8Array(texels) : undefined;
  if (normalMap) for (let i = 0; i < texels; i += 1) normalMap.set([128, 128, 255], i * 3);
  aoMap?.fill(255);
  curvMap?.fill(128);
  cavityMap?.fill(255);

  const lp = lowMesh.positions;
  const ln = lowMesh.normals;
  const hp = highMesh.positions;
  const hn = highMesh.normals;
  const hi = highMesh.indices;
  let hits = 0;
  let coveredCount = 0;

  const triangles = lowMesh.faceCount;
  for (let f = 0; f < triangles; f += 1) {
    const [a, b, c] = [lowMesh.indices[f * 3]!, lowMesh.indices[f * 3 + 1]!, lowMesh.indices[f * 3 + 2]!];
    const ax = low.uvs[a * 2]! * size;
    const ay = low.uvs[a * 2 + 1]! * size;
    const bx = low.uvs[b * 2]! * size;
    const by = low.uvs[b * 2 + 1]! * size;
    const cx = low.uvs[c * 2]! * size;
    const cy = low.uvs[c * 2 + 1]! * size;
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
        if (covered[at]) continue;
        covered[at] = 1;
        coveredCount += 1;

        const P: V3 = [0, 0, 0];
        const N: V3 = [0, 0, 0];
        const T: V3 = [0, 0, 0];
        let w = 0;
        for (let k = 0; k < 3; k += 1) {
          P[k] = l0 * lp[a * 3 + k]! + l1 * lp[b * 3 + k]! + l2 * lp[c * 3 + k]!;
          N[k] = l0 * ln[a * 3 + k]! + l1 * ln[b * 3 + k]! + l2 * ln[c * 3 + k]!;
          T[k] = l0 * tangents[a * 4 + k]! + l1 * tangents[b * 4 + k]! + l2 * tangents[c * 4 + k]!;
        }
        w = l0 * tangents[a * 4 + 3]! + l1 * tangents[b * 4 + 3]! + l2 * tangents[c * 4 + 3]! < 0 ? -1 : 1;
        const n = norm(N);
        const d = dot(n, T);
        const t = norm([T[0] - n[0] * d, T[1] - n[1] * d, T[2] - n[2] * d]);
        const bt = cross(n, t).map((v) => v * w) as V3;

        // Cast onto the high mesh from outside, then from inside.
        let hit = bvh.raycast([P[0] + n[0] * cage, P[1] + n[1] * cage, P[2] + n[2] * cage], [-n[0], -n[1], -n[2]], cage * 2);
        if (!hit) hit = bvh.raycast([P[0] - n[0] * cage, P[1] - n[1] * cage, P[2] - n[2] * cage], n, cage * 2);
        let hnorm: V3 = n;
        let q: V3 = P;
        let curv = 0;
        if (hit) {
          hits += 1;
          const [i0, i1, i2] = [hi[hit.triangle * 3]!, hi[hit.triangle * 3 + 1]!, hi[hit.triangle * 3 + 2]!];
          const [u, v, s] = hit.barycentric;
          hnorm = norm([
            u * hn[i0 * 3]! + v * hn[i1 * 3]! + s * hn[i2 * 3]!,
            u * hn[i0 * 3 + 1]! + v * hn[i1 * 3 + 1]! + s * hn[i2 * 3 + 1]!,
            u * hn[i0 * 3 + 2]! + v * hn[i1 * 3 + 2]! + s * hn[i2 * 3 + 2]!,
          ]);
          q = hit.point;
          if (curvature) curv = u * curvature[i0]! + v * curvature[i1]! + s * curvature[i2]!;
        }
        if (normalMap) {
          const tn = norm([dot(hnorm, t), dot(hnorm, bt), dot(hnorm, n)]);
          normalMap[at * 3] = Math.round((tn[0] * 0.5 + 0.5) * 255);
          normalMap[at * 3 + 1] = Math.round((tn[1] * 0.5 + 0.5) * 255);
          normalMap[at * 3 + 2] = Math.round((tn[2] * 0.5 + 0.5) * 255);
        }
        if (aoMap) {
          // Rotate the fan into the surface frame at the hit.
          const h = Math.abs(hnorm[1]) < 0.9 ? cross([0, 1, 0], hnorm) : cross([1, 0, 0], hnorm);
          const ht = norm(h);
          const hb = cross(hnorm, ht);
          const origin: V3 = [q[0] + hnorm[0] * diagonal * 1e-4, q[1] + hnorm[1] * diagonal * 1e-4, q[2] + hnorm[2] * diagonal * 1e-4];
          let blocked = 0;
          let total = 0;
          for (const dir of fan) {
            const weight = dir[2];
            const world: V3 = [ht[0] * dir[0] + hb[0] * dir[1] + hnorm[0] * dir[2], ht[1] * dir[0] + hb[1] * dir[1] + hnorm[1] * dir[2], ht[2] * dir[0] + hb[2] * dir[1] + hnorm[2] * dir[2]];
            total += weight;
            if (bvh.raycast(origin, world, aoDistance)) blocked += weight;
          }
          aoMap[at] = Math.round(255 * (1 - (total > 0 ? blocked / total : 0)));
        }
        if (curvMap) curvMap[at] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * (curv / scale))));
        if (cavityMap) cavityMap[at] = Math.round(255 * (1 - Math.min(1, Math.max(0, -curv / scale))));
      }
    }
    if (options.yieldNow && f % 256 === 255) await options.yieldNow();
  }

  const dilate = (map: Uint8Array, channels: number): void => {
    let frontier = covered.slice();
    for (let pass = 0; pass < padding; pass += 1) {
      const next = frontier.slice();
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const at = y * size + x;
          if (frontier[at]) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size || !frontier[ny * size + nx]) continue;
            for (let k = 0; k < channels; k += 1) map[at * channels + k] = map[(ny * size + nx) * channels + k]!;
            next[at] = 1;
            break;
          }
        }
      }
      frontier = next;
    }
  };
  if (padding > 0) {
    if (normalMap) dilate(normalMap, 3);
    if (aoMap) dilate(aoMap, 1);
    if (curvMap) dilate(curvMap, 1);
    if (cavityMap) dilate(cavityMap, 1);
  }

  return {
    size,
    ...(normalMap ? { normal: normalMap } : {}),
    ...(aoMap ? { ao: aoMap } : {}),
    ...(curvMap ? { curvature: curvMap } : {}),
    ...(cavityMap ? { cavity: cavityMap } : {}),
    coverage: coveredCount / texels,
    hitRate: coveredCount > 0 ? hits / coveredCount : 0,
  };
}
