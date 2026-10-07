import { z } from 'zod';

import { AIM_VIEWS, pixelRay, projectPoint, type AimView, type PreviewCamera } from '../camera';
import { applyDirection, applyPoint, invert, type Mat4 } from '../math';
import type { ResolvedRig } from '../rig';
import { facingBasis } from '../rig';
import { assetSkin } from '../skin';
import type { V3, SculptBrush } from './brush';
import type { SculptDocument } from './session';
import type { SculptSymmetry } from './symmetry';

/**
 * Aiming a stroke (Phase 104 Theme E). An agent does not drag a mouse; it says *where* — in the picture it
 * just looked at, on a named part of the body, in world coordinates, or "wherever the mask leaves open" —
 * and this module turns that into the surface points a {@link SculptDocument} stroke walks. Everything
 * resolves against the live mesh through its BVH, so a target that misses the surface fails with a sentence
 * rather than sculpting thin air.
 *
 * - **screen**: image pixels on a named preview view. The camera is the preview's own (`previewCamera`), so the
 *   pixel the agent pointed at is the pixel the renderer drew. Polylines are densified in pixel space so a long
 *   drag follows the surface instead of cutting across it.
 * - **region**: a rig bone (the dab lands where the bone's segment meets the surface, or sweeps along it), a
 *   landmark, a vertex group of the mesh, or a primitive part's footprint.
 * - **world**: xyz points or a path, snapped to the nearest surface point unless told not to.
 * - **mask**: every dab it takes to cover whatever the mask leaves open — the brush itself already respects the
 *   mask, so this is "paint the unmasked area".
 */

export const AIM_MAX_POINTS = 256;
export const AIM_MAX_DABS = 96;
export const SCREEN_SIZE_MIN = 64;
export const SCREEN_SIZE_MAX = 768;
export const SCREEN_SIZE_DEFAULT = 384;

const finite = z.number().finite();
export const AimViewSchema = z.enum(AIM_VIEWS);

export const ModelSculptTargetSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('screen'),
    /** The preview view the pixels are on: `front`, `back`, `left`, `right`/`side`, `top`, `iso`/`three_quarter`. */
    view: AimViewSchema,
    /** Pixels `[x, y]` from the picture's top-left; more than one is a stroke along them. */
    points: z.array(z.tuple([finite.min(-4096).max(4096), finite.min(-4096).max(4096)])).min(1).max(AIM_MAX_POINTS),
    /** Edge of the picture the pixels refer to (the preview's `size`, default 384). */
    size: z.number().int().min(SCREEN_SIZE_MIN).max(SCREEN_SIZE_MAX).optional(),
    /** Brush radius in pixels of that picture, instead of the top-level `radius`. */
    radiusPixels: z.number().finite().min(1).max(SCREEN_SIZE_MAX).optional(),
  }),
  z.object({
      mode: z.literal('region'),
      /** A rig bone (`leftUpperArm`), from `model_get_rig`'s table. */
      bone: z.string().min(1).max(40).optional(),
      /** A landmark name from `model_get_landmarks`. */
      landmark: z.string().min(1).max(40).optional(),
      /** A vertex group of the sculpt mesh (the primitive it was converted from), by name. */
      group: z.string().min(1).max(60).optional(),
      /** A primitive part (id or name): the dabs cover its footprint on the mesh. */
      part: z.string().min(1).max(60).optional(),
      /** With a bone: sweep along it, head to tail, instead of one dab at its middle. */
      along: z.boolean().optional(),
      /** Dabs along a bone, or the most to spread over a group, part or the unmasked area. */
      samples: z.number().int().min(1).max(AIM_MAX_DABS).optional(),
  }),
  z.object({
    mode: z.literal('world'),
    /** Points `[x, y, z]` in model space (metres); more than one is a path. */
    points: z.array(z.tuple([finite.min(-1000).max(1000), finite.min(-1000).max(1000), finite.min(-1000).max(1000)])).min(1).max(AIM_MAX_POINTS),
    /** Snap each point to the nearest surface point (default true). */
    snap: z.boolean().optional(),
  }),
  z.object({
    mode: z.literal('mask'),
    /** The most dabs to spread over the unmasked area (default 48). */
    samples: z.number().int().min(1).max(AIM_MAX_DABS).optional(),
  }),
]);
export type ModelSculptTarget = z.infer<typeof ModelSculptTargetSchema>;

export type AimIssue = { path: string; message: string };

export type AimStep = { kind: 'point'; point: V3; view: V3; breakBefore?: boolean } | { kind: 'ray'; origin: V3; dir: V3; breakBefore?: boolean };

export type AimPlan = { steps: AimStep[]; requested: number; hits: number; /** What the target resolved to, in words. */ note: string };

export type AimContext = {
  doc: SculptDocument;
  /** The sculpt part's world matrix (mesh space → model space). */
  toWorld: Mat4;
  /** Per view, the preview camera the agent saw (or would see). */
  camera: (view: AimView, size: number) => PreviewCamera | null;
  rig: ResolvedRig | null;
  landmarks: Record<string, V3>;
  /** The mesh's vertex-group names, in the order its groups are numbered. */
  groupNames: readonly string[];
  /** World-space bounds of a primitive part by reference (id or name), or `null` when there is none. */
  partBounds: (ref: string) => { min: V3; max: V3 } | null;
  /** The brush radius in mesh units. */
  radius: number;
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The mesh-space → world uniform scale of a matrix (cube root of its determinant). */
export function uniformScale(m: Mat4): number {
  const det = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!);
  return Math.cbrt(Math.abs(det)) || 1;
}

/** The unit normal of a triangle of the document's mesh (counter-clockwise winding). */
export function triangleNormal(doc: SculptDocument, t: number): V3 {
  const p = doc.mesh.positions;
  const i = doc.mesh.indices;
  const a = i[t * 3]! * 3;
  const b = i[t * 3 + 1]! * 3;
  const c = i[t * 3 + 2]! * 3;
  const e1: V3 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
  const e2: V3 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
  const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const l = len(n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** The surface point nearest `p` (mesh space) and a view direction that looks straight at it. */
function snapToSurface(doc: SculptDocument, p: V3): { point: V3; view: V3 } | null {
  const hit = doc.bvh.closestPoint(p);
  if (!hit) return null;
  const n = triangleNormal(doc, hit.triangle);
  return { point: hit.point, view: [-n[0], -n[1], -n[2]] };
}

/** Farthest-point sampling of `vertices` so dabs sit about `spacing` apart, most `max`, in a stable order. */
function spread(doc: SculptDocument, vertices: readonly number[], spacing: number, max: number): V3[] {
  if (vertices.length === 0) return [];
  const p = doc.mesh.positions;
  const at = (v: number): V3 => [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!];
  const picked: V3[] = [];
  const distance = new Float64Array(vertices.length).fill(Infinity);
  let next = 0;
  // Start from the vertex nearest the centroid so a small region still gets its middle.
  const centroid: V3 = [0, 0, 0];
  for (const v of vertices) {
    const q = at(v);
    centroid[0] += q[0] / vertices.length;
    centroid[1] += q[1] / vertices.length;
    centroid[2] += q[2] / vertices.length;
  }
  let best = Infinity;
  vertices.forEach((v, i) => {
    const d = len(sub(at(v), centroid));
    if (d < best) {
      best = d;
      next = i;
    }
  });
  while (picked.length < max) {
    const q = at(vertices[next]!);
    picked.push(q);
    let far = -1;
    let farD = spacing;
    for (let i = 0; i < vertices.length; i += 1) {
      distance[i] = Math.min(distance[i]!, len(sub(at(vertices[i]!), q)));
      if (distance[i]! > farD) {
        farD = distance[i]!;
        far = i;
      }
    }
    if (far < 0) break;
    next = far;
  }
  return picked;
}

/** Vertices of the mesh the given region covers, or an error sentence. */
export function regionVertices(
  ctx: AimContext,
  region: { bone?: string | undefined; landmark?: string | undefined; group?: string | undefined; part?: string | undefined },
  radius: number,
): { ok: true; vertices: number[]; note: string } | { ok: false; error: string } {
  const { doc } = ctx;
  const count = doc.mesh.vertexCount;
  const out: number[] = [];
  const p = doc.mesh.positions;
  const world = (v: number): V3 => applyPoint(ctx.toWorld, [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!]);
  if (region.bone !== undefined) {
    if (!ctx.rig) return { ok: false, error: 'This model has no rig — call model_auto_rig first, or aim by landmark, group or screen.' };
    const bone = ctx.rig.byName.get(region.bone);
    if (bone === undefined) return { ok: false, error: `The rig has no bone "${region.bone}". Bones: ${[...ctx.rig.byName.keys()].join(', ')}.` };
    const positions = new Array<number>(count * 3);
    for (let v = 0; v < count; v += 1) {
      const w = world(v);
      positions[v * 3] = w[0];
      positions[v * 3 + 1] = w[1];
      positions[v * 3 + 2] = w[2];
    }
    // The bone's influence: the vertices its skin weight reaches (the same weights the export uses).
    const skin = assetSkin(ctx.rig, positions);
    for (let v = 0; v < count; v += 1) {
      for (let k = 0; k < 4; k += 1) {
        if (skin.joints[v * 4 + k] === bone && skin.weights[v * 4 + k]! >= 0.05) {
          out.push(v);
          break;
        }
      }
    }
    return { ok: true, vertices: out, note: `bone ${region.bone} (${out.length} vertices in its skin influence)` };
  }
  if (region.landmark !== undefined) {
    const at = ctx.landmarks[region.landmark];
    if (!at) return { ok: false, error: `No landmark "${region.landmark}". Landmarks: ${Object.keys(ctx.landmarks).join(', ') || '(none)'}.` };
    for (let v = 0; v < count; v += 1) if (len(sub(world(v), at)) <= radius) out.push(v);
    return { ok: true, vertices: out, note: `landmark ${region.landmark} (${out.length} vertices within ${radius.toFixed(3)} m)` };
  }
  if (region.group !== undefined) {
    const index = ctx.groupNames.indexOf(region.group);
    const groups = doc.groups;
    if (index < 0 || !groups) return { ok: false, error: `The mesh has no vertex group "${region.group}". Groups: ${ctx.groupNames.join(', ') || '(none — it was not converted from primitives)'}.` };
    for (let v = 0; v < count; v += 1) if (groups[v] === index) out.push(v);
    return { ok: true, vertices: out, note: `group ${region.group} (${out.length} vertices)` };
  }
  const bounds = ctx.partBounds(region.part!);
  if (!bounds) return { ok: false, error: `No primitive part has id or unique name "${region.part}".` };
  for (let v = 0; v < count; v += 1) {
    const w = world(v);
    let inside = true;
    for (let k = 0; k < 3; k += 1) if (w[k]! < bounds.min[k]! - radius || w[k]! > bounds.max[k]! + radius) inside = false;
    if (inside) out.push(v);
  }
  return { ok: true, vertices: out, note: `part ${region.part} (${out.length} vertices inside its bounds)` };
}

/** Turns a target into surface steps. Failures are `{ ok: false, errors }` — never throws. */
export function resolveTarget(ctx: AimContext, target: ModelSculptTarget): { ok: true; plan: AimPlan } | { ok: false; errors: AimIssue[] } {
  const { doc } = ctx;
  const inverse = invert(ctx.toWorld);
  const scale = uniformScale(ctx.toWorld);
  const toLocal = (p: V3): V3 => applyPoint(inverse, p);
  const fail = (path: string, message: string): { ok: false; errors: AimIssue[] } => ({ ok: false, errors: [{ path, message }] });

  if (doc.mesh.faceCount === 0) return fail('part', 'The sculpt mesh is empty.');

  if (target.mode === 'screen') {
    const size = target.size ?? SCREEN_SIZE_DEFAULT;
    const camera = ctx.camera(target.view, size);
    if (!camera) return fail('target.view', 'There is nothing to look at — the design has no visible geometry.');
    const pixels: [number, number][] = [];
    const step = Math.max(1, (target.radiusPixels ?? ctx.radius * scale * camera.scale) * 0.3);
    target.points.forEach((pt, i) => {
      if (i === 0) {
        pixels.push([pt[0], pt[1]]);
        return;
      }
      const from = target.points[i - 1]!;
      const d = Math.hypot(pt[0] - from[0], pt[1] - from[1]);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 1; k <= n; k += 1) pixels.push([from[0] + ((pt[0] - from[0]) * k) / n, from[1] + ((pt[1] - from[1]) * k) / n]);
    });
    const steps: AimStep[] = [];
    let hits = 0;
    let missed = false;
    for (const [px, py] of pixels) {
      const ray = pixelRay(camera, px, py);
      const origin = toLocal(ray.origin);
      const dir = applyDirection(inverse, ray.dir);
      const hit = doc.raycast(origin, dir);
      if (!hit) {
        missed = true;
        continue;
      }
      hits += 1;
      const l = len(dir) || 1;
      steps.push({ kind: 'point', point: hit.point, view: [dir[0] / l, dir[1] / l, dir[2] / l], ...(missed ? { breakBefore: true } : {}) });
      missed = false;
    }
    if (hits === 0) {
      return fail('target.points', `None of the ${pixels.length} pixel(s) hit the surface on the ${target.view} view (${size} px). Point at the model itself, or render a preview and read the pixels off it.`);
    }
    return { ok: true, plan: { steps, requested: target.points.length, hits, note: `${hits} of ${pixels.length} sampled pixel(s) on the ${target.view} view hit the surface` } };
  }

  if (target.mode === 'world') {
    const steps: AimStep[] = [];
    let hits = 0;
    for (const pt of target.points) {
      const local = toLocal(pt);
      if (target.snap === false) {
        steps.push({ kind: 'point', point: local, view: [0, 0, -1] });
        hits += 1;
        continue;
      }
      const snapped = snapToSurface(doc, local);
      if (!snapped) continue;
      hits += 1;
      steps.push({ kind: 'point', point: snapped.point, view: snapped.view });
    }
    if (hits === 0) return fail('target.points', 'No point could be placed on the surface.');
    return { ok: true, plan: { steps, requested: target.points.length, hits, note: `${hits} world point(s)${target.snap === false ? '' : ' snapped to the surface'}` } };
  }

  if (target.mode === 'mask') {
    const open: number[] = [];
    const mask = doc.mask;
    for (let v = 0; v < mask.length; v += 1) if (mask[v]! < 0.5) open.push(v);
    if (open.length === 0) return fail('target', 'The whole mesh is masked, so a stroke has nowhere to land — clear or invert the mask first.');
    const spots = spread(doc, open, ctx.radius * 0.9, target.samples ?? 48);
    return {
      ok: true,
      plan: {
        steps: spots.map((point, i): AimStep => {
          const snapped = snapToSurface(doc, point);
          return { kind: 'point', point: snapped?.point ?? point, view: snapped?.view ?? [0, 0, -1], ...(i > 0 ? { breakBefore: true } : {}) };
        }),
        requested: spots.length,
        hits: spots.length,
        note: `${spots.length} dab(s) over the ${open.length} unmasked vertices`,
      },
    };
  }

  // region
  if ([target.bone, target.landmark, target.group, target.part].filter((x) => x !== undefined).length !== 1) {
    return fail('target', 'A region target takes exactly one of bone, landmark, group or part.');
  }
  if (target.bone !== undefined && target.along) {
    if (!ctx.rig) return fail('target.bone', 'This model has no rig — call model_auto_rig first, or aim by landmark, group or screen.');
    const index = ctx.rig.byName.get(target.bone);
    if (index === undefined) return fail('target.bone', `The rig has no bone "${target.bone}". Bones: ${[...ctx.rig.byName.keys()].join(', ')}.`);
    const bone = ctx.rig.bones[index]!;
    const n = Math.max(2, target.samples ?? Math.max(2, Math.ceil(len(sub(bone.tail, bone.head)) / (ctx.radius * scale * 0.5))));
    const steps: AimStep[] = [];
    for (let k = 0; k < n; k += 1) {
      const snapped = snapToSurface(doc, toLocal(lerp(bone.head, bone.tail, k / (n - 1))));
      if (snapped) steps.push({ kind: 'point', point: snapped.point, view: snapped.view });
    }
    if (steps.length === 0) return fail('target.bone', `Bone "${target.bone}" has no surface near it.`);
    return { ok: true, plan: { steps, requested: n, hits: steps.length, note: `${steps.length} dab(s) along bone ${target.bone}` } };
  }

  const found = regionVertices(ctx, target, ctx.radius * scale);
  if (!found.ok) return fail('target', found.error);
  if (found.vertices.length === 0) return fail('target', `The region ${found.note} covers no vertices of this mesh.`);
  let spots: V3[];
  if (target.landmark !== undefined) {
    spots = [toLocal(ctx.landmarks[target.landmark]!)];
  } else if (target.bone !== undefined) {
    const bone = ctx.rig!.bones[ctx.rig!.byName.get(target.bone)!]!;
    spots = [toLocal(lerp(bone.head, bone.tail, 0.5))];
  } else {
    spots = spread(doc, found.vertices, ctx.radius * 0.9, target.samples ?? 48);
  }
  const steps = spots.flatMap((spot, i): AimStep[] => {
    const snapped = snapToSurface(doc, spot);
    return snapped ? [{ kind: 'point', point: snapped.point, view: snapped.view, ...(i > 0 ? { breakBefore: true } : {}) }] : [];
  });
  if (steps.length === 0) return fail('target', `The region ${found.note} has no surface to land on.`);
  return { ok: true, plan: { steps, requested: spots.length, hits: steps.length, note: found.note } };
}

/** Runs a plan as one stroke. `null` when nothing moved. */
export function runAimedStroke(doc: SculptDocument, brush: SculptBrush, plan: AimPlan, options: { symmetry?: SculptSymmetry; toWorld?: Mat4; pressure?: number } = {}) {
  doc.beginStroke(brush, { ...(options.symmetry ? { symmetry: options.symmetry } : {}), ...(options.toWorld ? { toWorld: options.toWorld } : {}) });
  try {
    for (const step of plan.steps) {
      if (step.breakBefore) doc.strokeBreak();
      if (step.kind === 'ray') doc.strokeTo({ origin: step.origin, dir: step.dir, ...(options.pressure !== undefined ? { pressure: options.pressure } : {}) });
      else doc.strokeAt(step.point, step.view, options.pressure ?? 1);
    }
  } catch (error) {
    // Never leave the document mid-stroke.
    doc.endStroke();
    throw error;
  }
  return doc.endStroke();
}

// --- masks ----------------------------------------------------------------------------------------

/** Image-space polygon test (even-odd). */
export function pointInLasso(x: number, y: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The vertices whose pixel on `camera` falls inside `polygon` and that the camera can see (facing it and not behind other surface). */
export function lassoVertices(doc: SculptDocument, toWorld: Mat4, camera: PreviewCamera, polygon: readonly (readonly [number, number])[]): number[] {
  const out: number[] = [];
  const p = doc.mesh.positions;
  const n = doc.mesh.normals;
  const inverse = invert(toWorld);
  const dirLocal = applyDirection(inverse, camera.forward);
  const dl = len(dirLocal) || 1;
  const forward: V3 = [dirLocal[0] / dl, dirLocal[1] / dl, dirLocal[2] / dl];
  const diag = Math.max(camera.extent, 1e-6);
  for (let v = 0; v < doc.mesh.vertexCount; v += 1) {
    const local: V3 = [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!];
    const world = applyPoint(toWorld, local);
    const px = projectPoint(camera, world);
    if (!pointInLasso(px.x, px.y, polygon)) continue;
    const normal: V3 = [n[v * 3]!, n[v * 3 + 1]!, n[v * 3 + 2]!];
    if (dot(normal, forward) > 0.05) continue;
    // Visible: a ray from just in front of the vertex back toward the camera hits nothing.
    const eps = diag * 1e-3;
    const from: V3 = [local[0] + normal[0] * eps, local[1] + normal[1] * eps, local[2] + normal[2] * eps];
    if (doc.bvh.raycast(from, [-forward[0], -forward[1], -forward[2]])) continue;
    out.push(v);
  }
  return out;
}

/** Sets the mask over `vertices` to `value` (1 = frozen). One history step; `false` when nothing changed. */
export function maskVertices(doc: SculptDocument, vertices: readonly number[], value: 0 | 1): boolean {
  return doc.editMask((mask) => {
    for (const v of vertices) mask[v] = value;
  });
}

/** Grows or shrinks the masked area by `steps` rings of triangles: each vertex takes the largest (grow) or smallest (shrink) mask among itself and its neighbours. One history step. */
export function resizeMask(doc: SculptDocument, steps: number, direction: 'grow' | 'shrink'): boolean {
  return doc.editMask((mask) => {
    for (let s = 0; s < steps; s += 1) {
      const before = mask.slice();
      for (let v = 0; v < mask.length; v += 1) {
        let value = before[v]!;
        for (const u of doc.mesh.neighbours(v)) value = direction === 'grow' ? Math.max(value, before[u]!) : Math.min(value, before[u]!);
        mask[v] = value;
      }
    }
  });
}
