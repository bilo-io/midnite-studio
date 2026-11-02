import type { ResolvedRig } from '@midnite/studio-shared';

/**
 * A preview skeleton as plain data (Phase 125 Theme D): bones in parent-first order with positions local to
 * their parent. The 3D side turns it into `Bone` objects; keeping it data keeps the mannequin and the
 * Models-rig conversion testable without three.
 */
export type SkeletonBoneSpec = { name: string; parent: number | null; position: [number, number, number] };
export type SkeletonSpec = { bones: SkeletonBoneSpec[] };

type Def = [name: string, parent: string | null, x: number, y: number, z: number];

/** Metres, a 1.8 m figure standing on y = 0 facing +z; names are Mixamo's without the `mixamorig:` prefix. */
const MANNEQUIN: readonly Def[] = [
  ['Hips', null, 0, 1.0, 0],
  ['Spine', 'Hips', 0, 0.1, 0],
  ['Spine1', 'Spine', 0, 0.12, 0],
  ['Spine2', 'Spine1', 0, 0.12, 0],
  ['Neck', 'Spine2', 0, 0.16, 0],
  ['Head', 'Neck', 0, 0.1, 0],
  ...(['Left', 'Right'] as const).flatMap((side): Def[] => {
    const s = side === 'Left' ? 1 : -1;
    return [
      [`${side}Shoulder`, 'Spine2', s * 0.06, 0.12, 0],
      [`${side}Arm`, `${side}Shoulder`, s * 0.12, 0, 0],
      [`${side}ForeArm`, `${side}Arm`, s * 0.28, 0, 0],
      [`${side}Hand`, `${side}ForeArm`, s * 0.26, 0, 0],
      [`${side}UpLeg`, 'Hips', s * 0.09, -0.05, 0],
      [`${side}Leg`, `${side}UpLeg`, 0, -0.44, 0],
      [`${side}Foot`, `${side}Leg`, 0, -0.44, 0],
      [`${side}ToeBase`, `${side}Foot`, 0, -0.07, 0.14],
    ];
  }),
];

export function mannequinSkeleton(): SkeletonSpec {
  const index = new Map(MANNEQUIN.map((d, i) => [d[0], i]));
  return {
    bones: MANNEQUIN.map(([name, parent, x, y, z]) => ({ name, parent: parent === null ? null : (index.get(parent) ?? null), position: [x, y, z] })),
  };
}

/** A Models rig as a preview skeleton: each bone sits where its head is, relative to its parent's head. */
export function rigSkeleton(rig: Pick<ResolvedRig, 'bones'>): SkeletonSpec {
  return {
    bones: rig.bones.map((bone) => {
      const parent = bone.parent === null ? null : rig.bones[bone.parent];
      const base = parent ? parent.head : ([0, 0, 0] as const);
      return {
        name: bone.name,
        parent: bone.parent,
        position: [bone.head[0] - base[0], bone.head[1] - base[1], bone.head[2] - base[2]],
      };
    }),
  };
}
