import { Bvh } from './bvh';
import { buildAdjacency } from './editable-mesh';

/**
 * Skin-weight transfer (Phase 104 Theme F): after a decimate, remesh, subdivide or retopology the skeleton is
 * kept and each new vertex takes its weights from the nearest point on the old surface — the three corner
 * vertices of the closest triangle blended by barycentric coordinates — then smoothed over its one-ring,
 * truncated to the four strongest influences and renormalised to sum to 1.
 *
 * A design's skin is already derived from its rig and its geometry on every build (`computeSkin`), so this does
 * not replace that: it is how a topology edit *proves* the rig survived. The pipeline transfers the weights
 * across the edit, recomputes them on the new mesh, and reports the {@link skinDrift} between the two.
 */

export type SkinWeights = {
  /** 4 joint indices per vertex. */
  joints: ArrayLike<number>;
  /** 4 weights per vertex, summing to 1. */
  weights: ArrayLike<number>;
};

export const SKIN_INFLUENCES = 4;

export type TransferOptions = {
  /** Smoothing passes over the destination's one-ring (default 2). */
  smooth?: number;
  /** Destination triangles, for smoothing. Without them the transfer is unsmoothed. */
  dstIndices?: ArrayLike<number>;
};

type Influences = Map<number, number>;

function readVertex(skin: SkinWeights, v: number): Influences {
  const out: Influences = new Map();
  for (let k = 0; k < SKIN_INFLUENCES; k += 1) {
    const w = skin.weights[v * SKIN_INFLUENCES + k]!;
    if (w <= 0) continue;
    const j = skin.joints[v * SKIN_INFLUENCES + k]!;
    out.set(j, (out.get(j) ?? 0) + w);
  }
  return out;
}

function topFour(map: Influences): [number, number][] {
  const sorted = [...map].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, SKIN_INFLUENCES);
  const total = sorted.reduce((s, [, w]) => s + w, 0) || 1;
  return sorted.map(([j, w]) => [j, w / total]);
}

export function transferSkinWeights(
  src: { positions: ArrayLike<number>; indices: ArrayLike<number>; skin: SkinWeights },
  dstPositions: ArrayLike<number>,
  options: TransferOptions = {},
): { joints: number[]; weights: number[] } {
  const bvh = new Bvh(Float32Array.from(src.positions), Uint32Array.from(src.indices));
  const n = dstPositions.length / 3;
  let current: Influences[] = [];
  for (let v = 0; v < n; v += 1) {
    const hit = bvh.closestPoint([dstPositions[v * 3]!, dstPositions[v * 3 + 1]!, dstPositions[v * 3 + 2]!]);
    const blend: Influences = new Map();
    if (hit) {
      for (let k = 0; k < 3; k += 1) {
        const corner = src.indices[hit.triangle * 3 + k]!;
        for (const [j, w] of readVertex(src.skin, corner)) blend.set(j, (blend.get(j) ?? 0) + w * hit.barycentric[k]!);
      }
    }
    current.push(blend);
  }

  const passes = options.dstIndices ? (options.smooth ?? 2) : 0;
  if (passes > 0 && options.dstIndices) {
    const indices = Uint32Array.from(options.dstIndices);
    const adjacency = buildAdjacency(n, indices);
    for (let pass = 0; pass < passes; pass += 1) {
      const next: Influences[] = [];
      for (let v = 0; v < n; v += 1) {
        const merged: Influences = new Map();
        for (const [j, w] of current[v]!) merged.set(j, w * 0.5);
        const ring = new Set<number>();
        for (let i = adjacency.faceStart[v]!; i < adjacency.faceStart[v + 1]!; i += 1) {
          const f = adjacency.faceList[i]!;
          for (let k = 0; k < 3; k += 1) if (indices[f * 3 + k] !== v) ring.add(indices[f * 3 + k]!);
        }
        for (const u of ring) for (const [j, w] of current[u]!) merged.set(j, (merged.get(j) ?? 0) + (w * 0.5) / ring.size);
        next.push(merged);
      }
      current = next;
    }
  }

  const joints = new Array<number>(n * SKIN_INFLUENCES).fill(0);
  const weights = new Array<number>(n * SKIN_INFLUENCES).fill(0);
  for (let v = 0; v < n; v += 1) {
    const kept = topFour(current[v]!);
    if (kept.length === 0) {
      weights[v * SKIN_INFLUENCES] = 1;
      continue;
    }
    kept.forEach(([j, w], k) => {
      joints[v * SKIN_INFLUENCES + k] = j;
      weights[v * SKIN_INFLUENCES + k] = w;
    });
  }
  return { joints, weights };
}

/** Whether every vertex's weights sum to 1 (within `eps`) and use at most four influences by construction. */
export function skinIsNormalised(skin: SkinWeights, vertexCount: number, eps = 1e-5): boolean {
  for (let v = 0; v < vertexCount; v += 1) {
    let sum = 0;
    for (let k = 0; k < SKIN_INFLUENCES; k += 1) {
      const w = skin.weights[v * SKIN_INFLUENCES + k]!;
      if (w < -eps) return false;
      sum += w;
    }
    if (Math.abs(sum - 1) > eps) return false;
  }
  return true;
}

/** The mean and largest per-vertex L1 distance (0–2) between two skins over the same vertices. */
export function skinDrift(a: SkinWeights, b: SkinWeights, vertexCount: number): { mean: number; max: number } {
  let total = 0;
  let max = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    const ma = readVertex(a, v);
    const mb = readVertex(b, v);
    let d = 0;
    for (const j of new Set([...ma.keys(), ...mb.keys()])) d += Math.abs((ma.get(j) ?? 0) - (mb.get(j) ?? 0));
    total += d;
    if (d > max) max = d;
  }
  return { mean: vertexCount ? total / vertexCount : 0, max };
}
