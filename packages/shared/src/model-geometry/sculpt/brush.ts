import { z } from 'zod';

import type { Bvh } from '../mesh/bvh';
import type { EditableMesh } from '../mesh/editable-mesh';

/**
 * Sculpt brushes (Phase 104 Theme D): one dab of one brush on the worker-owned `EditableMesh`.
 *
 * A dab is a sphere on the surface — centre, radius, the area normal under it — and every brush is a
 * per-vertex displacement weighted by the falloff curve, the dab's strength and `1 - mask`. Brushes run
 * on the CPU over typed arrays (no three, no GPU), so the same code serves the editor's worker, MCP
 * strokes in main (Theme E) and bare vitest. Strokes, spacing, symmetry and undo live in `stroke.ts`;
 * this file is the maths of a single dab.
 *
 * Positions are the mesh's own (part-local) space. Amounts scale with the radius, so a brush feels the
 * same on a 2 cm nose and a 2 m torso.
 */

export const SCULPT_BRUSHES = ['draw', 'clay', 'inflate', 'smooth', 'grab', 'crease', 'flatten', 'pinch', 'mask'] as const;
export type SculptBrushKind = (typeof SCULPT_BRUSHES)[number];

export const SCULPT_FALLOFFS = ['smooth', 'sphere', 'root', 'sharp', 'linear', 'constant'] as const;
export type SculptFalloff = (typeof SCULPT_FALLOFFS)[number];

/** Smallest and largest dab spacing, as a fraction of the radius. */
export const SCULPT_SPACING_MIN = 0.02;
export const SCULPT_SPACING_MAX = 2;

export const SculptBrushSchema = z.object({
  brush: z.enum(SCULPT_BRUSHES),
  /** Dab radius in the mesh's own units. */
  radius: z.number().positive().max(1000),
  /** 0–1; the pointer's pressure multiplies it when a tablet reports one. */
  strength: z.number().min(0).max(1),
  falloff: z.enum(SCULPT_FALLOFFS).default('smooth'),
  /** Distance between dabs along a stroke, as a fraction of the radius. */
  spacing: z.number().min(SCULPT_SPACING_MIN).max(SCULPT_SPACING_MAX).default(0.1),
  /** The brush's opposite (Ctrl in Blender): draw carves, inflate deflates, pinch magnifies, mask erases. */
  invert: z.boolean().optional(),
  /** Leave vertices facing away from the viewer alone (needs the stroke's view direction). */
  frontFacesOnly: z.boolean().optional(),
});
export type SculptBrush = z.infer<typeof SculptBrushSchema>;

export type V3 = [number, number, number];

/** The falloff curve: weight at normalised distance `d` (0 at the centre, 1 at the rim). */
export function falloffWeight(kind: SculptFalloff, d: number): number {
  if (d >= 1) return 0;
  const t = d <= 0 ? 0 : d;
  switch (kind) {
    case 'smooth':
      return 1 - t * t * (3 - 2 * t);
    case 'sphere':
      return Math.sqrt(1 - t * t);
    case 'root':
      return 1 - Math.sqrt(t);
    case 'sharp':
      return (1 - t) * (1 - t);
    case 'linear':
      return 1 - t;
    case 'constant':
      return 1;
  }
}

/** What a dab works on: the mesh, its BVH (for the footprint) and the per-vertex mask (1 = frozen). */
export type SculptTarget = { mesh: EditableMesh; bvh: Bvh; mask: Float32Array };

export type Dab = {
  brush: SculptBrushKind;
  center: V3;
  radius: number;
  /** Already multiplied by pressure. */
  strength: number;
  falloff: SculptFalloff;
  invert?: boolean;
  /** Direction the viewer looks along (camera → surface), for front-faces-only. */
  view?: V3;
  frontFacesOnly?: boolean;
  /** The stroke's direction along the surface: clay strips lay a square footprint along it. */
  tangent?: V3;
};

/** Per-dab displacement as a fraction of the radius, at strength 1. */
export const DAB_SCALE = 0.05;

/** Called once per vertex before a dab first moves it (positions) or remasks it (mask) — the stroke's undo hook. */
export type DabRecorder = { position: (v: number) => void; mask: (v: number) => void };

export type DabResult = {
  /** Vertices whose position changed. */
  moved: number[];
  /** Vertices whose mask changed (the mask brush). */
  masked: number[];
  /** The largest single-vertex displacement this dab applied. */
  maxDisplacement: number;
};

const NONE: DabRecorder = { position: () => undefined, mask: () => undefined };

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
};

/**
 * Footprint weights for a dab: the vertices inside the sphere (or, for clay strips, the square along the
 * stroke), each with `falloff × (1 − mask)` (the mask brush ignores the mask it is painting).
 */
function footprint(target: SculptTarget, dab: Dab): { vertices: number[]; weights: Float32Array; areaNormal: V3; areaCenter: V3 } {
  const { mesh, bvh, mask } = target;
  const p = mesh.positions;
  const n = mesh.normals;
  const candidates = bvh.verticesInSphere(dab.center, dab.brush === 'clay' ? dab.radius * Math.SQRT2 : dab.radius);
  const vertices: number[] = [];
  const weights: number[] = [];
  const an: V3 = [0, 0, 0];
  const ac: V3 = [0, 0, 0];
  let wsum = 0;
  // Clay strips: a square footprint aligned with the stroke, in the plane of the hit.
  let u: V3 | null = null;
  let w: V3 | null = null;
  if (dab.brush === 'clay' && dab.tangent) {
    const t = norm(dab.tangent);
    const view = dab.view ? norm(dab.view) : null;
    // The plane is the surface's; without an area normal yet, use the mesh normal at the nearest candidate.
    const up = view ? ([-view[0], -view[1], -view[2]] as V3) : ([0, 1, 0] as V3);
    const side: V3 = norm([t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]);
    u = t;
    w = side;
  }
  for (const v of candidates) {
    const at = v * 3;
    const dx = p[at]! - dab.center[0];
    const dy = p[at + 1]! - dab.center[1];
    const dz = p[at + 2]! - dab.center[2];
    let d: number;
    if (u && w) d = Math.max(Math.abs(dx * u[0] + dy * u[1] + dz * u[2]), Math.abs(dx * w[0] + dy * w[1] + dz * w[2])) / dab.radius;
    else d = Math.hypot(dx, dy, dz) / dab.radius;
    if (d >= 1) continue;
    if (dab.frontFacesOnly && dab.view && n[at]! * dab.view[0] + n[at + 1]! * dab.view[1] + n[at + 2]! * dab.view[2] > 0) continue;
    let weight = falloffWeight(dab.falloff, d);
    if (dab.brush !== 'mask') weight *= 1 - (mask[v] ?? 0);
    if (weight <= 0) continue;
    vertices.push(v);
    weights.push(weight);
    an[0] += n[at]! * weight;
    an[1] += n[at + 1]! * weight;
    an[2] += n[at + 2]! * weight;
    ac[0] += p[at]! * weight;
    ac[1] += p[at + 1]! * weight;
    ac[2] += p[at + 2]! * weight;
    wsum += weight;
  }
  const areaCenter: V3 = wsum > 0 ? [ac[0] / wsum, ac[1] / wsum, ac[2] / wsum] : [...dab.center];
  return { vertices, weights: Float32Array.from(weights), areaNormal: norm(an), areaCenter };
}

/**
 * Applies one dab. Every brush first computes each vertex's target from a snapshot of the footprint (so
 * the order vertices are visited in never matters — smooth reads neighbours before any of them moves),
 * then writes the targets through `mesh.setPosition`, which marks them dirty for normals and the delta.
 */
export function applyDab(target: SculptTarget, dab: Dab, record: DabRecorder = NONE): DabResult {
  const { mesh, mask } = target;
  const p = mesh.positions;
  const n = mesh.normals;
  const { vertices, weights, areaNormal, areaCenter } = footprint(target, dab);
  const sign = dab.invert ? -1 : 1;
  const k = dab.strength;
  const amount = DAB_SCALE * dab.radius * k * sign;
  const moved: number[] = [];
  const masked: number[] = [];
  let maxDisplacement = 0;
  if (vertices.length === 0) return { moved, masked, maxDisplacement };

  if (dab.brush === 'mask') {
    for (let i = 0; i < vertices.length; i += 1) {
      const v = vertices[i]!;
      const before = mask[v] ?? 0;
      const after = Math.min(1, Math.max(0, before + sign * weights[i]! * k));
      if (after === before) continue;
      record.mask(v);
      mask[v] = after;
      masked.push(v);
    }
    return { moved, masked, maxDisplacement };
  }

  const targets = new Float64Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i += 1) {
    const v = vertices[i]!;
    const at = v * 3;
    const w = weights[i]!;
    const x = p[at]!;
    const y = p[at + 1]!;
    const z = p[at + 2]!;
    let tx = x;
    let ty = y;
    let tz = z;
    switch (dab.brush) {
      case 'draw': {
        tx += areaNormal[0] * amount * w;
        ty += areaNormal[1] * amount * w;
        tz += areaNormal[2] * amount * w;
        break;
      }
      case 'inflate': {
        tx += n[at]! * amount * w;
        ty += n[at + 1]! * amount * w;
        tz += n[at + 2]! * amount * w;
        break;
      }
      case 'clay':
      case 'flatten': {
        // Clay pulls the surface up to a plane just above the area centre (adds material, never removes on the
        // add side); flatten pulls everything to the plane through it.
        const offset = dab.brush === 'clay' ? amount * 2 : 0;
        const ox = areaCenter[0] + areaNormal[0] * offset;
        const oy = areaCenter[1] + areaNormal[1] * offset;
        const oz = areaCenter[2] + areaNormal[2] * offset;
        const dist = (x - ox) * areaNormal[0] + (y - oy) * areaNormal[1] + (z - oz) * areaNormal[2];
        if (dab.brush === 'clay' && dist * sign > 0) break;
        const f = Math.min(1, w * k);
        tx -= areaNormal[0] * dist * f;
        ty -= areaNormal[1] * dist * f;
        tz -= areaNormal[2] * dist * f;
        break;
      }
      case 'smooth': {
        const ring = mesh.neighbours(v);
        if (ring.length === 0) break;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const u of ring) {
          sx += p[u * 3]!;
          sy += p[u * 3 + 1]!;
          sz += p[u * 3 + 2]!;
        }
        const f = Math.min(1, w * k);
        tx += (sx / ring.length - x) * f;
        ty += (sy / ring.length - y) * f;
        tz += (sz / ring.length - z) * f;
        break;
      }
      case 'pinch':
      case 'crease': {
        // Pull towards the dab centre within the surface's plane (pinch), and for crease also carve along the normal.
        let cx = dab.center[0] - x;
        let cy = dab.center[1] - y;
        let cz = dab.center[2] - z;
        const along = cx * areaNormal[0] + cy * areaNormal[1] + cz * areaNormal[2];
        cx -= areaNormal[0] * along;
        cy -= areaNormal[1] * along;
        cz -= areaNormal[2] * along;
        const f = Math.min(1, w * k * 0.5) * sign;
        tx += cx * f;
        ty += cy * f;
        tz += cz * f;
        if (dab.brush === 'crease') {
          tx -= areaNormal[0] * amount * w;
          ty -= areaNormal[1] * amount * w;
          tz -= areaNormal[2] * amount * w;
        }
        break;
      }
      case 'grab':
        // Grab moves a captured footprint by the pointer's motion — see `grabDab`.
        break;
    }
    targets[i * 3] = tx;
    targets[i * 3 + 1] = ty;
    targets[i * 3 + 2] = tz;
  }
  for (let i = 0; i < vertices.length; i += 1) {
    const v = vertices[i]!;
    const at = v * 3;
    const dx = targets[i * 3]! - p[at]!;
    const dy = targets[i * 3 + 1]! - p[at + 1]!;
    const dz = targets[i * 3 + 2]! - p[at + 2]!;
    const d = Math.hypot(dx, dy, dz);
    if (d === 0 || !Number.isFinite(d)) continue;
    record.position(v);
    mesh.setPosition(v, targets[i * 3]!, targets[i * 3 + 1]!, targets[i * 3 + 2]!);
    moved.push(v);
    if (d > maxDisplacement) maxDisplacement = d;
  }
  return { moved, masked, maxDisplacement };
}

/** A grab stroke's captured footprint: chosen once at the first dab, then dragged by the pointer. */
export type GrabCapture = { vertices: Uint32Array; weights: Float32Array };

export function captureGrab(target: SculptTarget, dab: Pick<Dab, 'center' | 'radius' | 'strength' | 'falloff' | 'view' | 'frontFacesOnly'>): GrabCapture {
  const { vertices, weights } = footprint(target, { ...dab, brush: 'grab' });
  for (let i = 0; i < weights.length; i += 1) weights[i] = weights[i]! * Math.min(1, dab.strength);
  return { vertices: Uint32Array.from(vertices), weights };
}

/** Moves a grab capture by `delta` (mesh space), each vertex by its weight. */
export function grabDab(target: SculptTarget, capture: GrabCapture, delta: V3, record: DabRecorder = NONE): DabResult {
  const { mesh } = target;
  const p = mesh.positions;
  const moved: number[] = [];
  let maxDisplacement = 0;
  for (let i = 0; i < capture.vertices.length; i += 1) {
    const v = capture.vertices[i]!;
    const w = capture.weights[i]!;
    if (w <= 0) continue;
    const at = v * 3;
    record.position(v);
    mesh.setPosition(v, p[at]! + delta[0] * w, p[at + 1]! + delta[1] * w, p[at + 2]! + delta[2] * w);
    moved.push(v);
    const d = Math.hypot(delta[0], delta[1], delta[2]) * w;
    if (d > maxDisplacement) maxDisplacement = d;
  }
  return { moved, masked: [], maxDisplacement };
}
