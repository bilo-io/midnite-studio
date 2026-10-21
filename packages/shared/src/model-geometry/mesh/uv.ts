/**
 * Automatic UV unwrap (Phase 104 Theme F): seams by angle and curvature, least-squares conformal
 * parameterisation (LSCM) per chart, and a shelf packer that keeps every chart in its own padded box.
 *
 * 1. **Seams.** Faces grow into charts across shared edges, and growth stops where the face normal leaves the
 *    chart's mean normal by more than `angle`, or where the edge being crossed folds by more than `curvature`
 *    degrees. A cube therefore falls into six charts, a sphere into a handful of caps.
 * 2. **Flatten.** LSCM (Lévy et al. 2002) minimises the deviation of each triangle's map from a similarity, with
 *    two chart vertices pinned. It is solved matrix-free by Jacobi-preconditioned conjugate gradients. A
 *    result that folds over itself (or fails to converge) falls back to a planar projection of that chart.
 * 3. **Pack.** Every chart is rotated to its tightest box, scaled to the same texel density, and shelf-packed
 *    into the unit square with a padding gutter, so charts never overlap by construction.
 *
 * Seams become split vertices — the output has one vertex per (chart, source vertex) — and `source` maps each
 * output vertex back to the vertex it came from, so normals and vertex groups can be carried across.
 */

export type UnwrapSource = {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  groups?: ArrayLike<number>;
};

export type UnwrapOptions = {
  /** Largest angle (degrees) between a face and its chart's mean normal. Default 70. */
  angle?: number;
  /** Largest fold (degrees) of an edge a chart may grow across — the curvature seam. Default 55. */
  curvature?: number;
  /** Texture edge in texels, for padding and the density readout. Default 2048. */
  textureSize?: number;
  /** Gutter between charts in texels. Default 4. */
  padding?: number;
};

export type UnwrapResult = {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
  groups?: Uint16Array;
  /** The source vertex of each output vertex. */
  source: Uint32Array;
  charts: number;
  /** Charts that fell back to a planar projection. */
  planarCharts: number;
  /** Texels per model unit over the mesh's triangles (area-weighted mean, and the extremes). */
  density: { mean: number; min: number; max: number; textureSize: number };
  /** Share of the unit square the charts cover. */
  coverage: number;
};

export const UNWRAP_DEFAULT_ANGLE = 70;
export const UNWRAP_DEFAULT_CURVATURE = 55;

type V3 = [number, number, number];
type Chart = { faces: number[]; verts: number[]; uv: Float64Array; planar: boolean; area3d: number };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

export function unwrapMesh(source: UnwrapSource, options: UnwrapOptions = {}): UnwrapResult {
  const angle = options.angle ?? UNWRAP_DEFAULT_ANGLE;
  const curvature = options.curvature ?? UNWRAP_DEFAULT_CURVATURE;
  const size = options.textureSize ?? 2048;
  const padding = options.padding ?? 4;
  const n = source.positions.length / 3;
  const faceCount = source.indices.length / 3;
  const P = (v: number): V3 => [source.positions[v * 3]!, source.positions[v * 3 + 1]!, source.positions[v * 3 + 2]!];
  const idx = (f: number, k: number): number => source.indices[f * 3 + k]!;

  // Face normals and areas.
  const normal: V3[] = new Array(faceCount);
  const area = new Float64Array(faceCount);
  for (let f = 0; f < faceCount; f += 1) {
    const c = cross(sub(P(idx(f, 1)), P(idx(f, 0))), sub(P(idx(f, 2)), P(idx(f, 0))));
    const l = len(c);
    area[f] = l / 2;
    normal[f] = l > 0 ? [c[0] / l, c[1] / l, c[2] / l] : [0, 1, 0];
  }

  // Face adjacency through shared edges.
  const edgeFaces = new Map<number, number[]>();
  const key = (a: number, b: number): number => (a < b ? a * n + b : b * n + a);
  for (let f = 0; f < faceCount; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const e = key(idx(f, k), idx(f, (k + 1) % 3));
      const list = edgeFaces.get(e);
      if (list) list.push(f);
      else edgeFaces.set(e, [f]);
    }
  }
  const adjacent = (f: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < 3; k += 1) for (const g of edgeFaces.get(key(idx(f, k), idx(f, (k + 1) % 3)))!) if (g !== f) out.push(g);
    return out;
  };

  // --- 1. charts by region growing ---------------------------------------------------------------
  const cosAngle = Math.cos((angle * Math.PI) / 180);
  const cosFold = Math.cos((curvature * Math.PI) / 180);
  const chartOf = new Int32Array(faceCount).fill(-1);
  const order = Array.from({ length: faceCount }, (_, f) => f).sort((a, b) => area[b]! - area[a]! || a - b);
  const chartFaces: number[][] = [];
  for (const seed of order) {
    if (chartOf[seed]! >= 0) continue;
    const id = chartFaces.length;
    const faces = [seed];
    chartOf[seed] = id;
    const mean: V3 = [normal[seed]![0] * area[seed]!, normal[seed]![1] * area[seed]!, normal[seed]![2] * area[seed]!];
    for (let head = 0; head < faces.length; head += 1) {
      const f = faces[head]!;
      for (const g of adjacent(f)) {
        if (chartOf[g]! >= 0) continue;
        const m = len(mean) || 1;
        const along = dot(normal[g]!, [mean[0] / m, mean[1] / m, mean[2] / m]);
        if (along < cosAngle || dot(normal[g]!, normal[f]!) < cosFold) continue;
        chartOf[g] = id;
        faces.push(g);
        mean[0] += normal[g]![0] * area[g]!;
        mean[1] += normal[g]![1] * area[g]!;
        mean[2] += normal[g]![2] * area[g]!;
      }
    }
    chartFaces.push(faces);
  }

  // --- 2. flatten each chart ---------------------------------------------------------------------
  const charts: Chart[] = chartFaces.map((faces) => flatten(faces, idx, P, normal, area));

  // --- 3. scale to one density, rotate to tight boxes, pack --------------------------------------
  const boxes = charts.map((chart) => {
    // Uniform density: one UV unit per model unit.
    let uvArea = 0;
    const local = new Map<number, number>();
    chart.verts.forEach((v, i) => local.set(v, i));
    for (const f of chart.faces) {
      const i0 = local.get(idx(f, 0))!;
      const i1 = local.get(idx(f, 1))!;
      const i2 = local.get(idx(f, 2))!;
      const ax = chart.uv[i1 * 2]! - chart.uv[i0 * 2]!;
      const ay = chart.uv[i1 * 2 + 1]! - chart.uv[i0 * 2 + 1]!;
      const bx = chart.uv[i2 * 2]! - chart.uv[i0 * 2]!;
      const by = chart.uv[i2 * 2 + 1]! - chart.uv[i0 * 2 + 1]!;
      uvArea += Math.abs(ax * by - ay * bx) / 2;
    }
    const scale = uvArea > 1e-18 ? Math.sqrt(chart.area3d / uvArea) : 1;
    for (let i = 0; i < chart.uv.length; i += 1) chart.uv[i] = chart.uv[i]! * scale;
    rotateTight(chart.uv);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < chart.uv.length; i += 2) {
      minX = Math.min(minX, chart.uv[i]!);
      maxX = Math.max(maxX, chart.uv[i]!);
      minY = Math.min(minY, chart.uv[i + 1]!);
      maxY = Math.max(maxY, chart.uv[i + 1]!);
    }
    return { minX, minY, w: Math.max(maxX - minX, 1e-9), h: Math.max(maxY - minY, 1e-9) };
  });

  const placement = packShelves(boxes, padding / size);

  // --- output: one vertex per (chart, source vertex) ---------------------------------------------
  const outPos: number[] = [];
  const outUv: number[] = [];
  const outSrc: number[] = [];
  const outIdx: number[] = new Array(faceCount * 3);
  charts.forEach((chart, ci) => {
    const base = outPos.length / 3;
    const box = boxes[ci]!;
    const at = placement.positions[ci]!;
    chart.verts.forEach((v, i) => {
      const p = P(v);
      outPos.push(p[0], p[1], p[2]);
      outUv.push((chart.uv[i * 2]! - box.minX + at.x) * placement.scale, (chart.uv[i * 2 + 1]! - box.minY + at.y) * placement.scale);
      outSrc.push(v);
    });
    const local = new Map<number, number>();
    chart.verts.forEach((v, i) => local.set(v, base + i));
    for (const f of chart.faces) for (let k = 0; k < 3; k += 1) outIdx[f * 3 + k] = local.get(idx(f, k))!;
  });

  // Texel density over triangles.
  let weighted = 0;
  let total = 0;
  let min = Infinity;
  let max = 0;
  let covered = 0;
  for (let f = 0; f < faceCount; f += 1) {
    const a = outIdx[f * 3]!;
    const b = outIdx[f * 3 + 1]!;
    const c = outIdx[f * 3 + 2]!;
    const ax = outUv[b * 2]! - outUv[a * 2]!;
    const ay = outUv[b * 2 + 1]! - outUv[a * 2 + 1]!;
    const bx = outUv[c * 2]! - outUv[a * 2]!;
    const by = outUv[c * 2 + 1]! - outUv[a * 2 + 1]!;
    const uvA = Math.abs(ax * by - ay * bx) / 2;
    covered += uvA;
    if (area[f]! <= 1e-18) continue;
    const density = size * Math.sqrt(uvA / area[f]!);
    weighted += density * area[f]!;
    total += area[f]!;
    if (density < min) min = density;
    if (density > max) max = density;
  }

  return {
    positions: Float32Array.from(outPos),
    indices: Uint32Array.from(outIdx),
    uvs: Float32Array.from(outUv),
    ...(source.groups ? { groups: Uint16Array.from(outSrc.map((v) => source.groups![v]!)) } : {}),
    source: Uint32Array.from(outSrc),
    charts: charts.length,
    planarCharts: charts.filter((c) => c.planar).length,
    density: { mean: total > 0 ? weighted / total : 0, min: Number.isFinite(min) ? min : 0, max, textureSize: size },
    coverage: covered,
  };
}

// --- flattening ---------------------------------------------------------------------------------

function flatten(faces: number[], idx: (f: number, k: number) => number, P: (v: number) => V3, normal: V3[], area: Float64Array): Chart {
  const verts: number[] = [];
  const local = new Map<number, number>();
  for (const f of faces) {
    for (let k = 0; k < 3; k += 1) {
      const v = idx(f, k);
      if (!local.has(v)) {
        local.set(v, verts.length);
        verts.push(v);
      }
    }
  }
  let area3d = 0;
  for (const f of faces) area3d += area[f]!;
  const planarOf = (): Float64Array => planar(verts, faces, P, normal, area);

  if (faces.length === 1 || verts.length < 3) return { faces, verts, uv: planarOf(), planar: true, area3d };
  const lscm = solveLscm(verts, faces, local, idx, P);
  if (lscm && validUnfold(lscm, faces, local, idx)) return { faces, verts, uv: lscm, planar: false, area3d };
  return { faces, verts, uv: planarOf(), planar: true, area3d };
}

/** Projects a chart on the plane of its mean normal, with axes from the first principal direction. */
function planar(verts: number[], faces: number[], P: (v: number) => V3, normal: V3[], area: Float64Array): Float64Array {
  const mean: V3 = [0, 0, 0];
  for (const f of faces) {
    mean[0] += normal[f]![0] * area[f]!;
    mean[1] += normal[f]![1] * area[f]!;
    mean[2] += normal[f]![2] * area[f]!;
  }
  const l = len(mean) || 1;
  const nrm: V3 = [mean[0] / l, mean[1] / l, mean[2] / l];
  const helper: V3 = Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const ex = cross(helper, nrm);
  const exl = len(ex) || 1;
  const u: V3 = [ex[0] / exl, ex[1] / exl, ex[2] / exl];
  const v = cross(nrm, u);
  const out = new Float64Array(verts.length * 2);
  verts.forEach((vi, i) => {
    const p = P(vi);
    out[i * 2] = dot(p, u);
    out[i * 2 + 1] = dot(p, v);
  });
  return out;
}

/** Signed UV area of the chart's triangles must agree in sign (a fold over is a failed unfold). */
function validUnfold(uv: Float64Array, faces: number[], local: Map<number, number>, idx: (f: number, k: number) => number): boolean {
  let pos = 0;
  let neg = 0;
  for (const f of faces) {
    const i0 = local.get(idx(f, 0))!;
    const i1 = local.get(idx(f, 1))!;
    const i2 = local.get(idx(f, 2))!;
    const a = (uv[i1 * 2]! - uv[i0 * 2]!) * (uv[i2 * 2 + 1]! - uv[i0 * 2 + 1]!) - (uv[i1 * 2 + 1]! - uv[i0 * 2 + 1]!) * (uv[i2 * 2]! - uv[i0 * 2]!);
    if (!Number.isFinite(a)) return false;
    if (a > 0) pos += 1;
    else if (a < 0) neg += 1;
  }
  const minority = Math.min(pos, neg);
  if (neg > pos) for (let i = 1; i < uv.length; i += 2) uv[i] = -uv[i]!;
  return minority <= Math.max(0, Math.floor(faces.length * 0.005));
}

/** LSCM with two pinned vertices, solved by matrix-free CG on the normal equations. `null` when it will not converge. */
function solveLscm(verts: number[], faces: number[], local: Map<number, number>, idx: (f: number, k: number) => number, P: (v: number) => V3): Float64Array | null {
  const nv = verts.length;
  // Pin the two most distant vertices (far from an arbitrary one, then far from that).
  const far = (from: number): number => {
    let best = from;
    let bestD = -1;
    const pf = P(verts[from]!);
    for (let i = 0; i < nv; i += 1) {
      const d = len(sub(P(verts[i]!), pf));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const pinA = far(far(0));
  const pinB = far(pinA);
  if (pinA === pinB) return null;
  const pa = P(verts[pinA]!);
  const pb = P(verts[pinB]!);
  const pinDist = len(sub(pb, pa));
  if (pinDist < 1e-12) return null;

  const T = faces.length;
  // Per triangle: vertex locals, and the real/imag weights W_j / sqrt(2A).
  const tv = new Int32Array(T * 3);
  const wr = new Float64Array(T * 3);
  const wi = new Float64Array(T * 3);
  for (let t = 0; t < T; t += 1) {
    const f = faces[t]!;
    const p0 = P(idx(f, 0));
    const p1 = P(idx(f, 1));
    const p2 = P(idx(f, 2));
    const e1 = sub(p1, p0);
    const e2 = sub(p2, p0);
    const l1 = len(e1);
    if (l1 < 1e-18) return null;
    const x = [0, l1, dot(e2, e1) / l1];
    const nrm = cross(e1, e2);
    const y = [0, 0, len(nrm) / l1];
    const dT = x[1]! * y[2]! - 0 * x[2]!; // 2A, sign +
    if (dT < 1e-18) {
      // A degenerate triangle contributes nothing.
      for (let k = 0; k < 3; k += 1) tv[t * 3 + k] = local.get(idx(f, k))!;
      continue;
    }
    const s = 1 / Math.sqrt(dT);
    const W: [number, number][] = [
      [x[2]! - x[1]!, y[2]! - y[1]!],
      [x[0]! - x[2]!, y[0]! - y[2]!],
      [x[1]! - x[0]!, y[1]! - y[0]!],
    ];
    for (let k = 0; k < 3; k += 1) {
      tv[t * 3 + k] = local.get(idx(f, k))!;
      wr[t * 3 + k] = W[k]![0] * s;
      wi[t * 3 + k] = W[k]![1] * s;
    }
  }

  // Unknowns: u_i, v_i for every vertex; pinned ones are fixed.
  const fixed = new Uint8Array(nv);
  fixed[pinA] = 1;
  fixed[pinB] = 1;
  const z = new Float64Array(nv * 2);
  z[pinB * 2] = pinDist;

  /** y = A x over the free unknowns (pinned entries of x are treated as zero). */
  const applyA = (x: Float64Array, ry: Float64Array): void => {
    for (let t = 0; t < T; t += 1) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < 3; k += 1) {
        const v = tv[t * 3 + k]!;
        if (fixed[v]) continue;
        const u = x[v * 2]!;
        const w = x[v * 2 + 1]!;
        re += wr[t * 3 + k]! * u - wi[t * 3 + k]! * w;
        im += wi[t * 3 + k]! * u + wr[t * 3 + k]! * w;
      }
      ry[t * 2] = re;
      ry[t * 2 + 1] = im;
    }
  };
  const applyAt = (r: Float64Array, out: Float64Array): void => {
    out.fill(0);
    for (let t = 0; t < T; t += 1) {
      const re = r[t * 2]!;
      const im = r[t * 2 + 1]!;
      for (let k = 0; k < 3; k += 1) {
        const v = tv[t * 3 + k]!;
        if (fixed[v]) continue;
        out[v * 2] = out[v * 2]! + wr[t * 3 + k]! * re + wi[t * 3 + k]! * im;
        out[v * 2 + 1] = out[v * 2 + 1]! + -wi[t * 3 + k]! * re + wr[t * 3 + k]! * im;
      }
    }
  };

  // b = -A_pinned z_pinned, then rhs = A^T b.
  const b = new Float64Array(T * 2);
  for (let t = 0; t < T; t += 1) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < 3; k += 1) {
      const v = tv[t * 3 + k]!;
      if (!fixed[v]) continue;
      const u = z[v * 2]!;
      const w = z[v * 2 + 1]!;
      re += wr[t * 3 + k]! * u - wi[t * 3 + k]! * w;
      im += wi[t * 3 + k]! * u + wr[t * 3 + k]! * w;
    }
    b[t * 2] = -re;
    b[t * 2 + 1] = -im;
  }
  const rhs = new Float64Array(nv * 2);
  applyAt(b, rhs);

  // Jacobi preconditioner: the diagonal of A^T A.
  const diag = new Float64Array(nv * 2);
  for (let t = 0; t < T; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = tv[t * 3 + k]!;
      const q = wr[t * 3 + k]! ** 2 + wi[t * 3 + k]! ** 2;
      diag[v * 2] = diag[v * 2]! + q;
      diag[v * 2 + 1] = diag[v * 2 + 1]! + q;
    }
  }
  const inv = diag.map((d) => (d > 1e-18 ? 1 / d : 1));

  const x = new Float64Array(nv * 2);
  // Start from the planar guess along the pin axis so CG begins near a flat solution.
  const axis = sub(pb, pa);
  const axisLen = len(axis);
  const axisN: V3 = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
  for (let i = 0; i < nv; i += 1) {
    if (fixed[i]) continue;
    const d = sub(P(verts[i]!), pa);
    x[i * 2] = dot(d, axisN);
    const perp: V3 = [d[0] - axisN[0] * dot(d, axisN), d[1] - axisN[1] * dot(d, axisN), d[2] - axisN[2] * dot(d, axisN)];
    x[i * 2 + 1] = len(perp) * 0.5;
  }
  const scratch = new Float64Array(T * 2);
  const ax = new Float64Array(nv * 2);
  applyA(x, scratch);
  applyAt(scratch, ax);
  const r = new Float64Array(nv * 2);
  for (let i = 0; i < r.length; i += 1) r[i] = rhs[i]! - ax[i]!;
  const zv = new Float64Array(nv * 2);
  for (let i = 0; i < r.length; i += 1) zv[i] = r[i]! * inv[i]!;
  const p = Float64Array.from(zv);
  let rz = 0;
  for (let i = 0; i < r.length; i += 1) rz += r[i]! * zv[i]!;
  const rhsNorm = Math.sqrt(rhs.reduce((s, v) => s + v * v, 0)) || 1;
  const maxIter = Math.min(2000, Math.max(200, nv * 2));
  const ap = new Float64Array(nv * 2);
  for (let it = 0; it < maxIter; it += 1) {
    applyA(p, scratch);
    applyAt(scratch, ap);
    let pap = 0;
    for (let i = 0; i < p.length; i += 1) pap += p[i]! * ap[i]!;
    if (!(pap > 1e-300)) break;
    const alpha = rz / pap;
    let rn = 0;
    for (let i = 0; i < x.length; i += 1) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * ap[i]!;
      rn += r[i]! * r[i]!;
    }
    if (Math.sqrt(rn) < 1e-9 * rhsNorm) break;
    let rzNew = 0;
    for (let i = 0; i < r.length; i += 1) {
      zv[i] = r[i]! * inv[i]!;
      rzNew += r[i]! * zv[i]!;
    }
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < p.length; i += 1) p[i] = zv[i]! + beta * p[i]!;
  }
  for (let i = 0; i < nv; i += 1) {
    if (!fixed[i]) continue;
    x[i * 2] = z[i * 2]!;
    x[i * 2 + 1] = z[i * 2 + 1]!;
  }
  for (const value of x) if (!Number.isFinite(value)) return null;
  return x;
}

/** Rotates a chart's uvs (in place) by the angle that gives the smallest bounding box. */
function rotateTight(uv: Float64Array): void {
  let best = 0;
  let bestArea = Infinity;
  for (let deg = 0; deg < 90; deg += 3) {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = Math.sin((deg * Math.PI) / 180);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      const x = uv[i]! * c - uv[i + 1]! * s;
      const y = uv[i]! * s + uv[i + 1]! * c;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const a = (maxX - minX) * (maxY - minY);
    if (a < bestArea - 1e-12) {
      bestArea = a;
      best = deg;
    }
  }
  if (best === 0) return;
  const c = Math.cos((best * Math.PI) / 180);
  const s = Math.sin((best * Math.PI) / 180);
  for (let i = 0; i < uv.length; i += 2) {
    const x = uv[i]!;
    const y = uv[i + 1]!;
    uv[i] = x * c - y * s;
    uv[i + 1] = x * s + y * c;
  }
}

type Box = { minX: number; minY: number; w: number; h: number };

/**
 * Shelf packing of `boxes` into a square, with `gutter` (as a fraction of the final square) around each.
 * Finds the largest uniform `scale` (final = chart units × scale) that fits, and each box's corner in chart units.
 */
function packShelves(boxes: Box[], gutter: number): { scale: number; positions: { x: number; y: number }[] } {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b]!.h - boxes[a]!.h || a - b);
  let totalArea = 0;
  for (const b of boxes) totalArea += b.w * b.h;
  let scale = 1 / Math.sqrt(Math.max(totalArea, 1e-18) / 0.75);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pad = gutter / scale;
    const side = 1 / scale;
    const positions: { x: number; y: number }[] = new Array(boxes.length);
    let x = pad;
    let y = pad;
    let rowH = 0;
    let fits = true;
    for (const i of order) {
      const b = boxes[i]!;
      if (b.w + 2 * pad > side) {
        fits = false;
        break;
      }
      if (x + b.w + pad > side) {
        x = pad;
        y += rowH + pad;
        rowH = 0;
      }
      positions[i] = { x, y };
      x += b.w + pad;
      rowH = Math.max(rowH, b.h);
      if (y + rowH + pad > side) {
        fits = false;
        break;
      }
    }
    if (fits) return { scale, positions };
    scale *= 0.96;
  }
  // Pathological input: stack them in a column at a tiny scale (still disjoint).
  let y = 0;
  const positions = boxes.map((b) => {
    const at = { x: 0, y };
    y += b.h + gutter;
    return at;
  });
  const tallest = Math.max(y, ...boxes.map((b) => b.w), 1e-9);
  return { scale: 1 / tallest, positions };
}

/** Merges vertices at identical positions (and identical groups) — the exact inverse of an unwrap's seam splitting. */
export function weldVertices(source: { positions: ArrayLike<number>; indices: ArrayLike<number>; groups?: ArrayLike<number>; normals?: ArrayLike<number> }): {
  positions: Float32Array;
  indices: Uint32Array;
  groups?: Uint16Array;
  normals?: Float32Array;
  merged: number;
} {
  const n = source.positions.length / 3;
  const seen = new Map<string, number>();
  const remap = new Uint32Array(n);
  const keep: number[] = [];
  for (let v = 0; v < n; v += 1) {
    const k = `${source.positions[v * 3]},${source.positions[v * 3 + 1]},${source.positions[v * 3 + 2]},${source.groups ? source.groups[v] : ''}`;
    const hit = seen.get(k);
    if (hit !== undefined) {
      remap[v] = hit;
      continue;
    }
    remap[v] = keep.length;
    seen.set(k, keep.length);
    keep.push(v);
  }
  const positions = new Float32Array(keep.length * 3);
  keep.forEach((v, i) => positions.set([source.positions[v * 3]!, source.positions[v * 3 + 1]!, source.positions[v * 3 + 2]!], i * 3));
  const indices = Uint32Array.from(Array.from(source.indices as ArrayLike<number>, (v) => remap[v]!));
  return {
    positions,
    indices,
    ...(source.groups ? { groups: Uint16Array.from(keep.map((v) => source.groups![v]!)) } : {}),
    ...(source.normals ? { normals: Float32Array.from(keep.flatMap((v) => [source.normals![v * 3]!, source.normals![v * 3 + 1]!, source.normals![v * 3 + 2]!])) } : {}),
    merged: n - keep.length,
  };
}
