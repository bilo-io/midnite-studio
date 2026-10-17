import {
  boneWorldMatrices,
  clipTiming,
  computeSkin,
  MAX_INFLUENCES,
  type MeshPart,
  type ModelClip,
  type ModelSpec,
  type PartSkin,
  type Pose,
  resolveRig,
  type ResolvedRig,
  restPose,
  samplePose,
  skinMatrices,
  skinParts,
} from '@midnite/studio-shared';

import type { EditorScene } from './spec-geometry';

/**
 * The editor's view of a rigged design: the resolved rig, each solid part's skin, and the posed
 * meshes for a clip at a time. It is the kernel's own CPU skinning (`skinParts`), so the viewport
 * poses exactly as previews and the `.glb` export do. Pure and memoised per spec object, so a
 * playing clip re-skins only the vertices, never the rig or the weights.
 */

export type RigModel = {
  rig: ResolvedRig;
  /** Indices into the editor scene's `parts` of the meshes that deform (boolean operands stay put). */
  solids: number[];
  /** One skin per entry of `solids`. */
  skins: PartSkin[];
};

const cache = new WeakMap<EditorScene, RigModel | null>();

export function rigModel(spec: ModelSpec, scene: EditorScene): RigModel | null {
  if (cache.has(scene)) return cache.get(scene)!;
  const rig = resolveRig(spec);
  let model: RigModel | null = null;
  if (rig) {
    const solids = scene.parts.map((p, i) => (p.role === 'solid' ? i : -1)).filter((i) => i >= 0);
    model = { rig, solids, skins: computeSkin(spec, rig, solids.map((i) => scene.parts[i]!)) };
  }
  cache.set(scene, model);
  return model;
}

/** The clip the timeline is on, or `undefined`. */
export const clipNamed = (spec: ModelSpec, name: string | null): ModelClip | undefined =>
  name === null ? undefined : spec.animations?.find((c) => c.name === name);

/** The pose a clip has at `time`; the rest pose with no clip. */
export function poseAt(model: RigModel, clip: ModelClip | undefined, time: number): Pose {
  return clip ? samplePose(model.rig, clip, time) : restPose(model.rig);
}

/** The scene with its solid meshes skinned into `pose`; the same object when there is nothing to move. */
export function posedScene(scene: EditorScene, model: RigModel, pose: Pose): EditorScene {
  const matrices = skinMatrices(model.rig, pose);
  const moved = skinParts(
    model.solids.map((i) => scene.parts[i]!),
    model.skins,
    matrices,
  );
  const parts: MeshPart[] = [...scene.parts];
  model.solids.forEach((at, k) => (parts[at] = moved[k]!));
  return { ...scene, parts };
}

export type BoneSegment = { name: string; head: [number, number, number]; tail: [number, number, number] };

/** Every bone's posed head and tail, for the viewport overlay. */
export function boneSegments(rig: ResolvedRig, pose: Pose): BoneSegment[] {
  const world = boneWorldMatrices(rig, pose);
  return rig.bones.map((bone, i) => {
    const m = world[i]!;
    const d = [bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]];
    const at = (x: number, y: number, z: number): [number, number, number] => [
      m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
      m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
      m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
    ];
    return { name: bone.name, head: at(0, 0, 0), tail: at(d[0]!, d[1]!, d[2]!) };
  });
}

/** Blender's weight ramp: blue (0) → green (0.5) → red (1), as linear RGB. */
export function weightColor(w: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, w));
  return t < 0.5 ? [0, t * 2, 1 - t * 2] : [(t - 0.5) * 2, 1 - (t - 0.5) * 2, 0];
}

/** Per-vertex colours of one skinned part for `bone`'s weight (rgb triples). */
export function weightColors(skin: PartSkin, bone: number): number[] {
  const out: number[] = [];
  for (let v = 0; v < skin.joints.length / MAX_INFLUENCES; v += 1) {
    let w = 0;
    for (let k = 0; k < MAX_INFLUENCES; k += 1) if (skin.joints[v * MAX_INFLUENCES + k] === bone) w += skin.weights[v * MAX_INFLUENCES + k]!;
    out.push(...weightColor(w));
  }
  return out;
}

/** Where the playhead lands after `dt` seconds of playback: wraps when looping, stops at the end otherwise. */
export function advancePlayhead(clip: ModelClip, time: number, dt: number, loop: boolean): { time: number; ended: boolean } {
  const { duration } = clipTiming(clip);
  const next = time + dt;
  if (next < duration) return { time: next, ended: false };
  if (loop && duration > 0) return { time: next % duration, ended: false };
  return { time: duration, ended: true };
}
