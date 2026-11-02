/**
 * Bone-name retargeting (Phase 125 Theme D), pure. A clip's tracks name bones the way its source rig did
 * (`mixamorig:LeftUpLeg`, `thigh.L`, `leftUpperLeg`); a preview model names them its own way. Both are folded to
 * one canonical key (the VRM humanoid vocabulary the Models rigs already use) and matched on that. Exact names
 * win first, so a rig that shares the clip's names needs no table at all. No IK, no rest-pose correction.
 */

const SIDE_WORDS = /^(left|right)/;

/** Removes rig-export noise: namespaces, `mixamorig`, separators, case. */
export function normaliseBone(name: string): string {
  return name
    .replace(/^.*[|:](?=[^|:]+$)/, '')
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

type Side = 'left' | 'right' | null;

function splitSide(raw: string): { side: Side; base: string } {
  const cleaned = raw.replace(/^.*[|:](?=[^|:]+$)/, '').replace(/^mixamorig[:_]?/i, '');
  // `thigh.L`, `arm_R`, `Arm-l`
  let m = /^(.*?)[._\-\s]([lr])$/i.exec(cleaned);
  if (m) return { side: m[2]!.toLowerCase() === 'l' ? 'left' : 'right', base: m[1]!.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() };
  // `l_arm`, `R.Hand`
  m = /^([lr])[._\-\s](.+)$/i.exec(cleaned);
  if (m) return { side: m[1]!.toLowerCase() === 'l' ? 'left' : 'right', base: m[2]!.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() };
  const flat = cleaned.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const w = SIDE_WORDS.exec(flat);
  if (w) return { side: w[1] as 'left' | 'right', base: flat.slice(w[1]!.length) };
  const tail = /^(.+?)(left|right)$/.exec(flat);
  if (tail) return { side: tail[2] as 'left' | 'right', base: tail[1]! };
  return { side: null, base: flat };
}

const SIDELESS: Record<string, string> = {
  hips: 'hips',
  hip: 'hips',
  pelvis: 'hips',
  spine: 'spine',
  spine0: 'spine',
  spine1: 'chest',
  chest: 'chest',
  spine2: 'upperChest',
  upperchest: 'upperChest',
  neck: 'neck',
  neck1: 'neck',
  head: 'head',
};

const SIDED: Record<string, string> = {
  shoulder: 'Shoulder',
  clavicle: 'Shoulder',
  arm: 'UpperArm',
  upperarm: 'UpperArm',
  forearm: 'LowerArm',
  lowerarm: 'LowerArm',
  hand: 'Hand',
  upleg: 'UpperLeg',
  upperleg: 'UpperLeg',
  thigh: 'UpperLeg',
  leg: 'LowerLeg',
  lowerleg: 'LowerLeg',
  calf: 'LowerLeg',
  shin: 'LowerLeg',
  foot: 'Foot',
  toebase: 'Toes',
  toes: 'Toes',
  toe: 'Toes',
};

const FINGER = /^(?:hand)?(thumb|index|middle|ring|pinky)(\d)$/;
const FINGER_JOINTS: Record<string, readonly string[]> = {
  thumb: ['Metacarpal', 'Proximal', 'Distal'],
  index: ['Proximal', 'Intermediate', 'Distal'],
  middle: ['Proximal', 'Intermediate', 'Distal'],
  ring: ['Proximal', 'Intermediate', 'Distal'],
  pinky: ['Proximal', 'Intermediate', 'Distal'],
};
// VRM names a finger `leftIndexProximal`; a Mixamo-like one is `LeftHandIndex1`.
const FINGER_VRM = /^(thumb|index|middle|ring|little)(metacarpal|proximal|intermediate|distal)$/;

/** The canonical (VRM-style) key for a bone name, or `null` when the table does not know it. */
export function canonicalBone(name: string): string | null {
  const { side, base } = splitSide(name);
  if (side === null) return SIDELESS[base] ?? null;
  const finger = FINGER.exec(base);
  if (finger) {
    const joint = FINGER_JOINTS[finger[1]!]?.[Number(finger[2]) - 1];
    return joint ? `${side}${finger[1] === 'pinky' ? 'Little' : cap(finger[1]!)}${joint}` : null;
  }
  const vrm = FINGER_VRM.exec(base);
  if (vrm) return `${side}${cap(vrm[1]!)}${cap(vrm[2]!)}`;
  const part = SIDED[base];
  return part ? `${side}${part}` : null;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export type BoneMap = {
  /** Source bone → target bone. */
  map: Map<string, string>;
  /** Source bones with no counterpart on the target (their tracks are dropped). */
  unmatched: string[];
};

/** Matches each source bone to a target bone: the identical name, then the same normalised name, then the same canonical key. */
export function buildBoneMap(sourceBones: readonly string[], targetBones: readonly string[]): BoneMap {
  const exact = new Set(targetBones);
  const byNormal = new Map<string, string>();
  const byCanon = new Map<string, string>();
  for (const bone of targetBones) {
    const n = normaliseBone(bone);
    if (!byNormal.has(n)) byNormal.set(n, bone);
    const c = canonicalBone(bone);
    if (c && !byCanon.has(c)) byCanon.set(c, bone);
  }
  const map = new Map<string, string>();
  const taken = new Set<string>();
  const unmatched: string[] = [];
  for (const source of sourceBones) {
    const target = exact.has(source) ? source : (byNormal.get(normaliseBone(source)) ?? byCanon.get(canonicalBone(source) ?? '\0'));
    // Two source bones never drive one target: the first wins, the rest are reported.
    if (target && !taken.has(target)) {
      map.set(source, target);
      taken.add(target);
    } else unmatched.push(source);
  }
  return { map, unmatched };
}

export type TrackTarget = { bone: string; property: 'position' | 'quaternion' | 'scale' };

/** The bone and property a three.js track name addresses (`Hips.quaternion`, `.bones[Hips].position`), or `null`. */
export function parseTrackName(name: string): TrackTarget | null {
  const bones = /^\.bones\[(.+)\]\.(position|quaternion|scale)$/.exec(name);
  if (bones) return { bone: bones[1]!, property: bones[2] as TrackTarget['property'] };
  const m = /^(.+)\.(position|quaternion|scale)$/.exec(name);
  return m ? { bone: m[1]!, property: m[2] as TrackTarget['property'] } : null;
}
