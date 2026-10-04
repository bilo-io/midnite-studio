import type { ModelSpec } from '../media-model';
import { type Mat4, type Vec3, multiply, translation, v3 } from './math';
import { type Quat, qIdentity, trsMatrix } from './quat';
import { indexParts, resolveRef, type MeshPart } from './scene';
import { partAncestry, type ResolvedRig } from './rig';

/**
 * Skin weights and linear-blend skinning — one implementation for the editor's live pose, the
 * MCP preview renders, and the `.glb` export's `JOINTS_0`/`WEIGHTS_0`.
 *
 * **Method: a part-aware envelope**, not bone heat. The kernel's parts are separate closed
 * primitives, so heat diffusion (Baran & Popović) cannot flow between them and would need a sparse
 * solve per bone; and an envelope over the whole skeleton bleeds (a torso vertex beside a hanging
 * arm follows the arm). So:
 *
 * 1. Every part is **bound** to one bone: `rig.bind` (the part, or a group above it), else a name
 *    hint (`wheel` → the nearest wheel; on a vehicle everything else → `body`), else the bone nearest
 *    the part's centroid.
 * 2. A vertex may only follow that bone's **region**: the bone, its parent, and its in-line chain of
 *    descendants up to the first branch — so a single capsule bound to `leftUpperLeg` still bends at
 *    the knee and ankle, but never follows the other leg or an arm.
 * 3. Within the region the vertex takes the **nearest bone segment**, then blends with that bone's
 *    parent and child across each joint: 50/50 on the joint, fading to 0 at `falloff × bone length`.
 *    `falloff: 0` is rigid skinning. Vehicles are always rigid (a tyre must not smear into its strut).
 *
 * At most 4 influences per vertex, normalised to sum to 1.
 */

export const MAX_INFLUENCES = 4;

export type PartSkin = {
  /** 4 joint indices (into `ResolvedRig.bones`) per vertex. */
  joints: number[];
  /** 4 weights per vertex, summing to 1. */
  weights: number[];
  /** The bone the part is bound to. */
  bone: number;
};

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): { distance: number; along: number; length: number } {
  const ab = v3.sub(b, a);
  const length = v3.len(ab);
  if (length < 1e-9) return { distance: v3.len(v3.sub(p, a)), along: 0, length: 0 };
  const along = v3.dot(v3.sub(p, a), ab) / length;
  const t = Math.min(1, Math.max(0, along / length));
  return { distance: v3.len(v3.sub(p, v3.lerp(a, b, t))), along, length };
}

function nearestBone(rig: ResolvedRig, p: Vec3, among: readonly number[]): number {
  let best = among[0] ?? 0;
  let bestD = Infinity;
  for (const i of among) {
    const d = segmentDistance(p, rig.bones[i]!.head, rig.bones[i]!.tail).distance;
    if (d < bestD - 1e-9) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const WHEEL_RE = /wheel|tire|tyre|rim|hubcap/;

/** The bone each built part is bound to (see the file comment for the order of rules). */
export function partBindings(spec: ModelSpec, rig: ResolvedRig, parts: readonly MeshPart[]): number[] {
  const index = indexParts(spec.parts);
  const bind = new Map<number, number>();
  for (const [ref, boneName] of Object.entries(spec.rig?.bind ?? {})) {
    const at = resolveRef(index, ref);
    const bone = rig.byName.get(boneName);
    if (at !== null && bone !== undefined) bind.set(at, bone);
  }
  const all = rig.bones.map((_, i) => i);
  const wheels = all.filter((i) => rig.bones[i]!.name.startsWith('wheel_'));
  const body = rig.byName.get('body');
  const steering = rig.byName.get('steering');
  return parts.map((part) => {
    for (const at of partAncestry(spec.parts, part.sourceIndex)) {
      const hit = bind.get(at);
      if (hit !== undefined) return hit;
    }
    const n = part.positions.length / 3;
    let c: Vec3 = [0, 0, 0];
    for (let i = 0; i < part.positions.length; i += 3) c = v3.add(c, [part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!]);
    c = v3.scale(c, 1 / Math.max(1, n));
    const name = spec.parts[part.sourceIndex]?.name.toLowerCase() ?? '';
    if (rig.anatomy === 'vehicle') {
      if (/steer/.test(name) && steering !== undefined) return steering;
      if (WHEEL_RE.test(name) && wheels.length > 0) return nearestBone(rig, c, wheels);
      if (body !== undefined) {
        // An unnamed part centred on a wheel hub is part of that wheel; anything else rides on the body.
        if (wheels.length > 0) {
          const w = nearestBone(rig, c, wheels);
          const hub = rig.bones[w]!.head;
          const strut = rig.byName.get(`suspension_${rig.bones[w]!.name.slice('wheel_'.length)}`);
          const radius = strut === undefined ? 0 : v3.len(v3.sub(rig.bones[strut]!.head, hub)) / 0.8;
          if (radius > 0 && v3.len(v3.sub(c, hub)) < 0.5 * radius) return w;
        }
        return body;
      }
    }
    return nearestBone(rig, c, all);
  });
}

/** The bones a vertex of a part bound to `bone` may follow. */
function regionOf(rig: ResolvedRig, bone: number): number[] {
  const out = [bone];
  const parent = rig.bones[bone]!.parent;
  if (parent !== null) out.push(parent);
  let at = bone;
  let guard = 0;
  while (rig.children[at]!.length === 1 && guard++ < 16) {
    at = rig.children[at]![0]!;
    out.push(at);
  }
  return out;
}

export function computeSkin(spec: ModelSpec, rig: ResolvedRig, parts: readonly MeshPart[]): PartSkin[] {
  const bound = partBindings(spec, rig, parts);
  const rigid = rig.anatomy === 'vehicle' || rig.falloff <= 0;
  return parts.map((part, pi) => {
    const bone = bound[pi]!;
    const region = regionOf(rig, bone);
    const count = part.positions.length / 3;
    const joints = new Array<number>(count * MAX_INFLUENCES).fill(0);
    const weights = new Array<number>(count * MAX_INFLUENCES).fill(0);
    for (let v = 0; v < count; v += 1) {
      const p: Vec3 = [part.positions[v * 3]!, part.positions[v * 3 + 1]!, part.positions[v * 3 + 2]!];
      const n = rigid ? bone : nearestBone(rig, p, region);
      const influences: [number, number][] = [];
      if (rigid) influences.push([n, 1]);
      else {
        const b = rig.bones[n]!;
        const seg = segmentDistance(p, b.head, b.tail);
        const width = Math.max(1e-6, rig.falloff * seg.length);
        let wParent = 0;
        if (b.parent !== null) wParent = Math.min(1, Math.max(0, 0.5 - seg.along / (2 * width)));
        let wChild = 0;
        let child: number | null = null;
        const inline = rig.children[n]!.filter((c) => region.includes(c));
        if (inline.length === 1) {
          child = inline[0]!;
          const cLen = v3.len(v3.sub(rig.bones[child]!.tail, rig.bones[child]!.head));
          const cWidth = Math.max(1e-6, rig.falloff * Math.min(seg.length, cLen || seg.length));
          wChild = Math.min(1, Math.max(0, 0.5 - (seg.length - seg.along) / (2 * cWidth)));
        }
        const wSelf = Math.max(0, 1 - wParent - wChild);
        influences.push([n, wSelf]);
        if (wParent > 0 && b.parent !== null) influences.push([b.parent, wParent]);
        if (wChild > 0 && child !== null) influences.push([child, wChild]);
      }
      const total = influences.reduce((s, [, w]) => s + w, 0) || 1;
      influences
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_INFLUENCES)
        .forEach(([j, w], k) => {
          joints[v * MAX_INFLUENCES + k] = j;
          weights[v * MAX_INFLUENCES + k] = w / total;
        });
      if (weights[v * MAX_INFLUENCES] === 0) weights[v * MAX_INFLUENCES] = 1;
    }
    return { joints, weights, bone };
  });
}

// --- forward kinematics ------------------------------------------------------------------------

/** A bone's offset from rest: a rotation about its head (model axes, in its parent's frame) and a translation. */
export type BonePose = { rotation: Quat; translation: Vec3 };
export type Pose = BonePose[];

export const restPose = (rig: ResolvedRig): Pose => rig.bones.map(() => ({ rotation: qIdentity(), translation: [0, 0, 0] }));

/** The local transform a bone has in its parent — what a glTF joint node carries. */
export function boneLocal(rig: ResolvedRig, i: number, pose: BonePose): { translation: Vec3; rotation: Quat } {
  const b = rig.bones[i]!;
  const parentHead: Vec3 = b.parent === null ? [0, 0, 0] : rig.bones[b.parent]!.head;
  return { translation: v3.add(v3.sub(b.head, parentHead), pose.translation), rotation: pose.rotation };
}

/** Each bone's world matrix in `pose` (row-major). */
export function boneWorldMatrices(rig: ResolvedRig, pose: Pose): Mat4[] {
  const out: Mat4[] = [];
  rig.bones.forEach((b, i) => {
    const local = boneLocal(rig, i, pose[i] ?? { rotation: qIdentity(), translation: [0, 0, 0] });
    const m = trsMatrix(local.translation, local.rotation);
    out.push(b.parent === null ? m : multiply(out[b.parent]!, m));
  });
  return out;
}

/** World × inverse bind: what moves a rest-pose vertex to its posed place. */
export function skinMatrices(rig: ResolvedRig, pose: Pose): Mat4[] {
  return boneWorldMatrices(rig, pose).map((m, i) => multiply(m, translation(v3.scale(rig.bones[i]!.head, -1))));
}

/** Rest-pose parts moved by `matrices` (linear blend skinning); normals follow the blended rotation. */
export function skinParts(parts: readonly MeshPart[], skins: readonly PartSkin[], matrices: readonly Mat4[]): MeshPart[] {
  return parts.map((part, pi) => {
    const skin = skins[pi]!;
    const positions = new Array<number>(part.positions.length);
    const normals = new Array<number>(part.normals.length);
    const m = new Array<number>(12);
    for (let v = 0; v < part.positions.length / 3; v += 1) {
      m.fill(0);
      for (let k = 0; k < MAX_INFLUENCES; k += 1) {
        const w = skin.weights[v * MAX_INFLUENCES + k]!;
        if (w === 0) continue;
        const j = matrices[skin.joints[v * MAX_INFLUENCES + k]!]!;
        for (let e = 0; e < 12; e += 1) m[e] = m[e]! + j[e]! * w;
      }
      const [x, y, z] = [part.positions[v * 3]!, part.positions[v * 3 + 1]!, part.positions[v * 3 + 2]!];
      positions[v * 3] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
      positions[v * 3 + 1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
      positions[v * 3 + 2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
      const [nx, ny, nz] = [part.normals[v * 3]!, part.normals[v * 3 + 1]!, part.normals[v * 3 + 2]!];
      const n = v3.norm([m[0]! * nx + m[1]! * ny + m[2]! * nz, m[4]! * nx + m[5]! * ny + m[6]! * nz, m[8]! * nx + m[9]! * ny + m[10]! * nz]);
      normals[v * 3] = n[0];
      normals[v * 3 + 1] = n[1];
      normals[v * 3 + 2] = n[2];
    }
    return { ...part, positions, normals };
  });
}
