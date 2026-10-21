/**
 * Media ▸ Models — anatomy, the bone-naming table, and the rig/animation part of a design.
 *
 * **This file is the single source of truth for bone names.** A rig may only use the names its
 * anatomy's table lists, so a later agent or tool can find `leftUpperLeg` or `wheel_FL` by name
 * without guessing. Bipeds use the VRM 1.0 humanoid names (which match Unity's `HumanBodyBones`
 * one for one, in camelCase) plus a `root` bone at the ground for root motion; vehicles use
 * upper-case corner suffixes (`wheel_FL`, `suspension_RR`).
 *
 * Conventions every rig shares:
 * - Model space is the design's: Y up, right-handed, metres-ish. The model **faces `facing`**
 *   (default `+z`, glTF's front), and a character's **left is +X** when it faces +Z (VRM 1.0).
 * - A bone is a segment `head → tail` in model space, at rest. Its rest orientation is the identity,
 *   so a pose rotation is expressed in model axes about the bone's head.
 * - A clip stores its *kind* and parameters, not keyframes: the kernel (`model-geometry/clips.ts`)
 *   generates the motion, and pose-mode edits are additive `keys` on top. Exports bake it.
 *
 * zod only, like the rest of `shared`.
 */
import { z } from 'zod';

// --- anatomy ---------------------------------------------------------------------------------

export const MODEL_ANATOMIES = ['static', 'biped', 'quadruped', 'vehicle'] as const;
export const ModelAnatomySchema = z.enum(MODEL_ANATOMIES);
export type ModelAnatomy = z.infer<typeof ModelAnatomySchema>;

export const MODEL_ANATOMY_LABELS: Record<ModelAnatomy, string> = {
  static: 'Static object',
  biped: 'Biped',
  quadruped: 'Quadruped',
  vehicle: 'Vehicle',
};

/** The way a model faces — what "forward" means to the clips and to the vehicle's corner names. */
export const MODEL_FACINGS = ['+z', '-z', '+x', '-x'] as const;
export const ModelFacingSchema = z.enum(MODEL_FACINGS);
export type ModelFacing = z.infer<typeof ModelFacingSchema>;

// --- the bone table ---------------------------------------------------------------------------

export type BoneSide = 'center' | 'left' | 'right';

export type BoneDef = {
  /** The canonical name — the only spelling a rig may use. */
  name: string;
  /** Canonical parent; `null` for the root. */
  parent: string | null;
  /** Auto-rig always places it and `validateRig` reports it missing. */
  required: boolean;
  side: BoneSide;
  /** The same bone on the other side, for mirroring and symmetric clips. */
  mirror?: string;
  /** Other rigs' spellings (Mixamo, Unreal, Rigify, Unity) — what retargeting and imports map from. */
  aliases: readonly string[];
};

const bone = (name: string, parent: string | null, required: boolean, side: BoneSide, aliases: readonly string[], mirror?: string): BoneDef => ({
  name,
  parent,
  required,
  side,
  aliases,
  ...(mirror ? { mirror } : {}),
});

/** One side of a humanoid limb set, mirrored to build both. */
function humanoidSide(side: 'left' | 'right'): BoneDef[] {
  const L = side === 'left';
  const s = L ? 'left' : 'right';
  const o = L ? 'right' : 'left';
  const S = L ? 'Left' : 'Right';
  const ue = L ? 'l' : 'r';
  const rg = L ? 'L' : 'R';
  return [
    bone(`${s}Shoulder`, 'upperChest', false, side, [`mixamorig:${S}Shoulder`, `clavicle_${ue}`, `shoulder.${rg}`, `${S}Shoulder`], `${o}Shoulder`),
    bone(`${s}UpperArm`, `${s}Shoulder`, true, side, [`mixamorig:${S}Arm`, `upperarm_${ue}`, `upper_arm.${rg}`, `${S}UpperArm`, `${S}Arm`], `${o}UpperArm`),
    bone(`${s}LowerArm`, `${s}UpperArm`, true, side, [`mixamorig:${S}ForeArm`, `lowerarm_${ue}`, `forearm.${rg}`, `${S}LowerArm`, `${S}ForeArm`], `${o}LowerArm`),
    bone(`${s}Hand`, `${s}LowerArm`, true, side, [`mixamorig:${S}Hand`, `hand_${ue}`, `hand.${rg}`, `${S}Hand`], `${o}Hand`),
    bone(`${s}UpperLeg`, 'hips', true, side, [`mixamorig:${S}UpLeg`, `thigh_${ue}`, `thigh.${rg}`, `${S}UpperLeg`, `${S}UpLeg`], `${o}UpperLeg`),
    bone(`${s}LowerLeg`, `${s}UpperLeg`, true, side, [`mixamorig:${S}Leg`, `calf_${ue}`, `shin.${rg}`, `${S}LowerLeg`, `${S}Leg`], `${o}LowerLeg`),
    bone(`${s}Foot`, `${s}LowerLeg`, true, side, [`mixamorig:${S}Foot`, `foot_${ue}`, `foot.${rg}`, `${S}Foot`], `${o}Foot`),
    bone(`${s}Toes`, `${s}Foot`, false, side, [`mixamorig:${S}ToeBase`, `ball_${ue}`, `toe.${rg}`, `${S}Toes`, `${S}ToeBase`], `${o}Toes`),
  ];
}

/** Bipeds: VRM 1.0 humanoid names (= Unity `HumanBodyBones` in camelCase) under a `root`. */
export const BIPED_BONES: readonly BoneDef[] = [
  bone('root', null, true, 'center', ['Root', 'root', 'Armature', 'mixamorig:Root']),
  bone('hips', 'root', true, 'center', ['mixamorig:Hips', 'pelvis', 'Hips']),
  bone('spine', 'hips', true, 'center', ['mixamorig:Spine', 'spine_01', 'spine.001', 'Spine']),
  bone('chest', 'spine', true, 'center', ['mixamorig:Spine1', 'spine_02', 'spine.002', 'Chest']),
  bone('upperChest', 'chest', false, 'center', ['mixamorig:Spine2', 'spine_03', 'spine.003', 'UpperChest']),
  bone('neck', 'upperChest', false, 'center', ['mixamorig:Neck', 'neck_01', 'spine.004', 'Neck']),
  bone('head', 'neck', true, 'center', ['mixamorig:Head', 'head', 'spine.006', 'Head']),
  ...humanoidSide('left'),
  ...humanoidSide('right'),
];

function quadrupedLeg(end: 'Front' | 'Hind', side: 'left' | 'right'): BoneDef[] {
  const s = side;
  const o = side === 'left' ? 'right' : 'left';
  const parent = end === 'Front' ? 'chest' : 'hips';
  const short = `${end === 'Front' ? 'f' : 'h'}${side === 'left' ? 'l' : 'r'}`;
  return [
    bone(`${s}${end}UpperLeg`, parent, true, side, [`${short}_upperleg`, `${s}_${end.toLowerCase()}_thigh`], `${o}${end}UpperLeg`),
    bone(`${s}${end}LowerLeg`, `${s}${end}UpperLeg`, true, side, [`${short}_lowerleg`, `${s}_${end.toLowerCase()}_shin`], `${o}${end}LowerLeg`),
    bone(`${s}${end}Foot`, `${s}${end}LowerLeg`, true, side, [`${short}_foot`, `${s}_${end.toLowerCase()}_paw`], `${o}${end}Foot`),
  ];
}

/** Four-legged animals: the humanoid trunk names, `<side><Front|Hind><Segment>` legs, and a tail chain. */
export const QUADRUPED_BONES: readonly BoneDef[] = [
  bone('root', null, true, 'center', ['Root', 'root']),
  bone('hips', 'root', true, 'center', ['pelvis', 'Hips']),
  bone('spine', 'hips', true, 'center', ['spine_01', 'Spine']),
  bone('chest', 'spine', true, 'center', ['spine_02', 'Chest']),
  bone('neck', 'chest', true, 'center', ['neck_01', 'Neck']),
  bone('head', 'neck', true, 'center', ['Head']),
  ...quadrupedLeg('Front', 'left'),
  ...quadrupedLeg('Front', 'right'),
  ...quadrupedLeg('Hind', 'left'),
  ...quadrupedLeg('Hind', 'right'),
  bone('tail1', 'hips', false, 'center', ['tail_01', 'Tail']),
  bone('tail2', 'tail1', false, 'center', ['tail_02']),
  bone('tail3', 'tail2', false, 'center', ['tail_03']),
];

/** Wheeled vehicles. A `suspension_XX` carries travel and steering yaw; its `wheel_XX` only spins. */
export const VEHICLE_BONES: readonly BoneDef[] = [
  bone('root', null, true, 'center', ['Root', 'root']),
  bone('body', 'root', true, 'center', ['chassis', 'Body', 'hull']),
  bone('steering', 'body', false, 'center', ['steering_wheel', 'SteeringWheel']),
  ...(['FL', 'FR', 'RL', 'RR'] as const).flatMap((corner) => {
    const side: BoneSide = corner.endsWith('L') ? 'left' : 'right';
    const mirror = corner[0] + (corner.endsWith('L') ? 'R' : 'L');
    const low = corner.toLowerCase();
    return [
      bone(`suspension_${corner}`, 'root', false, side, [`susp_${low}`, `Suspension_${corner}`], `suspension_${mirror}`),
      bone(`wheel_${corner}`, `suspension_${corner}`, false, side, [`wheel_${low}`, `Wheel_${corner}`, `tire_${low}`], `wheel_${mirror}`),
    ];
  }),
];

/** Every anatomy's table. A static object has no bones. */
export const MODEL_BONE_TABLE: Record<ModelAnatomy, readonly BoneDef[]> = {
  static: [],
  biped: BIPED_BONES,
  quadruped: QUADRUPED_BONES,
  vehicle: VEHICLE_BONES,
};

export const boneDef = (anatomy: ModelAnatomy, name: string): BoneDef | undefined =>
  MODEL_BONE_TABLE[anatomy].find((b) => b.name === name);

/**
 * Another rig's bone name → this table's, or `null`. Exact canonical names win, then aliases
 * (case-insensitive, with any `prefix:` such as `mixamorig:` also tried bare).
 */
export function canonicalBoneName(anatomy: ModelAnatomy, name: string): string | null {
  const table = MODEL_BONE_TABLE[anatomy];
  if (table.some((b) => b.name === name)) return name;
  const lower = name.toLowerCase();
  const bare = lower.includes(':') ? lower.slice(lower.lastIndexOf(':') + 1) : lower;
  for (const b of table) {
    if (b.name.toLowerCase() === lower || b.name.toLowerCase() === bare) return b.name;
  }
  for (const b of table) {
    for (const alias of b.aliases) {
      const a = alias.toLowerCase();
      if (a === lower) return b.name;
      if (a.includes(':') && a.slice(a.lastIndexOf(':') + 1) === bare) return b.name;
    }
  }
  return null;
}

// --- the rig on a design ----------------------------------------------------------------------

const RIG_COORD_MAX = 1000;
const coord = z.number().finite().min(-RIG_COORD_MAX).max(RIG_COORD_MAX);
const Vec3 = z.tuple([coord, coord, coord]);

export const MODEL_MAX_BONES = 64;
export const MODEL_BONE_NAME_MAX = 40;

export const ModelBoneSchema = z.object({
  /** A name from `MODEL_BONE_TABLE[anatomy]`. */
  name: z.string().trim().min(1).max(MODEL_BONE_NAME_MAX),
  /** Defaults to the table's parent; set only to re-parent within the table. */
  parent: z.string().trim().min(1).max(MODEL_BONE_NAME_MAX).optional(),
  /** Rest-pose joint position, model space. */
  head: Vec3,
  /** Rest-pose end of the bone, model space. */
  tail: Vec3,
});
export type ModelBone = z.infer<typeof ModelBoneSchema>;

/** Width of the blend across a joint, as a fraction of the bone's length (0 = rigid). */
export const MODEL_RIG_FALLOFF_DEFAULT = 0.25;

export const ModelRigSchema = z.object({
  facing: ModelFacingSchema.optional(),
  bones: z.array(ModelBoneSchema).max(MODEL_MAX_BONES),
  /** Part (id, or unique name) → the bone it is bound to. Unlisted parts bind to the nearest bone. */
  bind: z.record(z.string().min(1).max(60), z.string().min(1).max(MODEL_BONE_NAME_MAX)).optional(),
  /** Skin-weight blend across joints, fraction of bone length; 0 = every part moves rigidly with its bone. */
  falloff: z.number().finite().min(0).max(1).optional(),
});
export type ModelRig = z.infer<typeof ModelRigSchema>;

// --- clips -----------------------------------------------------------------------------------

export const BIPED_CLIP_KINDS = ['idle', 'walk', 'run', 'getHit', 'fallAndGetUp', 'die', 'jump', 'doubleJump', 'dodge', 'dash'] as const;
export const QUADRUPED_CLIP_KINDS = ['idle', 'walk', 'run'] as const;
export const VEHICLE_CLIP_KINDS = ['idle', 'drive', 'turnLeft', 'turnRight', 'brake', 'suspensionBounce'] as const;

/** Every generated motion, plus `custom` — a clip made only of keys (pose mode). */
export const MODEL_CLIP_KINDS = [
  'idle',
  'walk',
  'run',
  'getHit',
  'fallAndGetUp',
  'die',
  'jump',
  'doubleJump',
  'dodge',
  'dash',
  'drive',
  'turnLeft',
  'turnRight',
  'brake',
  'suspensionBounce',
  'custom',
] as const;
export const ModelClipKindSchema = z.enum(MODEL_CLIP_KINDS);
export type ModelClipKind = z.infer<typeof ModelClipKindSchema>;

/** The presets an anatomy offers, in menu order. */
export const MODEL_CLIP_PRESETS: Record<ModelAnatomy, readonly ModelClipKind[]> = {
  static: [],
  biped: BIPED_CLIP_KINDS,
  quadruped: QUADRUPED_CLIP_KINDS,
  vehicle: VEHICLE_CLIP_KINDS,
};

export const MODEL_CLIP_LABELS: Record<ModelClipKind, string> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  getHit: 'Get hit',
  fallAndGetUp: 'Fall and get up',
  die: 'Die',
  jump: 'Jump',
  doubleJump: 'Double jump',
  dodge: 'Dodge',
  dash: 'Dash',
  drive: 'Drive',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  brake: 'Brake',
  suspensionBounce: 'Suspension bounce',
  custom: 'Custom',
};

/** Seconds and looping each kind defaults to. */
export const MODEL_CLIP_DEFAULTS: Record<ModelClipKind, { duration: number; loop: boolean }> = {
  idle: { duration: 2.4, loop: true },
  walk: { duration: 1.1, loop: true },
  run: { duration: 0.7, loop: true },
  getHit: { duration: 0.6, loop: false },
  fallAndGetUp: { duration: 3.2, loop: false },
  die: { duration: 1.8, loop: false },
  jump: { duration: 1.1, loop: false },
  doubleJump: { duration: 1.6, loop: false },
  dodge: { duration: 0.7, loop: false },
  dash: { duration: 0.5, loop: false },
  drive: { duration: 1.0, loop: true },
  turnLeft: { duration: 1.6, loop: false },
  turnRight: { duration: 1.6, loop: false },
  brake: { duration: 1.2, loop: false },
  suspensionBounce: { duration: 1.4, loop: false },
  custom: { duration: 1.0, loop: true },
};

export const MODEL_MAX_CLIPS = 32;
export const MODEL_MAX_CLIP_KEYS = 512;
export const MODEL_CLIP_DURATION_MAX = 30;

/** An additive pose edit on one bone at one time — what pose mode writes. */
export const ModelClipKeySchema = z.object({
  bone: z.string().trim().min(1).max(MODEL_BONE_NAME_MAX),
  /** Seconds from the clip's start. */
  time: z.number().finite().min(0).max(MODEL_CLIP_DURATION_MAX),
  /** Euler degrees (X → Y → Z, model axes), added on top of the generated motion. */
  rotation: Vec3.optional(),
  /** Offset in model units, added to the bone's position (root and hips mostly). */
  translation: Vec3.optional(),
});
export type ModelClipKey = z.infer<typeof ModelClipKeySchema>;

export const ModelClipSchema = z.object({
  /** Unique within the design; what the glTF animation is called. */
  name: z.string().trim().min(1).max(MODEL_BONE_NAME_MAX),
  kind: ModelClipKindSchema,
  /** Seconds; default from `MODEL_CLIP_DEFAULTS`. */
  duration: z.number().finite().min(0.1).max(MODEL_CLIP_DURATION_MAX).optional(),
  loop: z.boolean().optional(),
  /** Playback-rate multiplier baked into the clip (a 2× walk is half as long). */
  speed: z.number().finite().min(0.1).max(4).optional(),
  /** Motion amplitude, 1 = default. */
  intensity: z.number().finite().min(0).max(2).optional(),
  /** `false`: the `root` bone travels (root motion); default `true`, the clip stays in place. */
  inPlace: z.boolean().optional(),
  keys: z.array(ModelClipKeySchema).max(MODEL_MAX_CLIP_KEYS).optional(),
});
export type ModelClip = z.infer<typeof ModelClipSchema>;

/** The clip's effective length and looping after defaults and `speed`. */
export function clipTiming(clip: ModelClip): { duration: number; loop: boolean } {
  const base = MODEL_CLIP_DEFAULTS[clip.kind];
  return { duration: (clip.duration ?? base.duration) / (clip.speed ?? 1), loop: clip.loop ?? base.loop };
}

// --- edits ------------------------------------------------------------------------------------

/** Most ops one rig or clip patch may carry — the editor's single gestures and an agent's batch alike. */
export const MODEL_RIG_PATCH_MAX_OPS = 64;

const BoneName = z.string().trim().min(1).max(MODEL_BONE_NAME_MAX);

/** One edit to a design's rig — what `model_patch_rig` takes and the editor's rig panel dispatches. */
export const ModelRigOpSchema = z.discriminatedUnion('op', [
  /** Add the bone, or move/re-parent it; omitted fields keep their value (a new bone needs head and tail). */
  z.object({ op: z.literal('setBone'), name: BoneName, head: Vec3.optional(), tail: Vec3.optional(), parent: BoneName.nullable().optional() }),
  z.object({ op: z.literal('removeBone'), name: BoneName }),
  /** Bind a part (id or unique name) to a bone; `null` returns it to the automatic choice. */
  z.object({ op: z.literal('bind'), part: z.string().min(1).max(60), bone: BoneName.nullable() }),
  z.object({ op: z.literal('falloff'), value: z.number().finite().min(0).max(1) }),
  z.object({ op: z.literal('facing'), value: ModelFacingSchema }),
]);
export type ModelRigOp = z.infer<typeof ModelRigOpSchema>;

const OpenFields = z.record(z.string(), z.unknown());

/** One edit to a design's clips — what `model_patch_animations` takes and the clip panel dispatches. */
export const ModelClipOpSchema = z.discriminatedUnion('op', [
  /** A whole clip, as `ModelClipSchema` describes; a missing name defaults to the kind. */
  z.object({ op: z.literal('add'), clip: OpenFields }),
  /** Fields merged over the named clip (`null` clears one back to its default), then re-validated. */
  z.object({ op: z.literal('update'), name: BoneName, fields: OpenFields }),
  z.object({ op: z.literal('remove'), name: BoneName }),
  /** Add (or replace, same bone and time) additive keys on a clip. */
  z.object({ op: z.literal('setKeys'), name: BoneName, keys: z.array(ModelClipKeySchema).min(1).max(MODEL_MAX_CLIP_KEYS) }),
  z.object({ op: z.literal('clearKeys'), name: BoneName, bone: BoneName.optional() }),
]);
export type ModelClipOp = z.infer<typeof ModelClipOpSchema>;
