import type { ModelPart, ModelSpec } from '../media-model';
import {
  MODEL_BONE_TABLE,
  MODEL_CLIP_PRESETS,
  canonicalBoneName,
  clipTiming,
  type ModelAnatomy,
  type ModelBone,
  type ModelFacing,
  type ModelRig,
} from '../media-model-rig';
import { type Vec3, v3 } from './math';
import { buildScene, indexParts, parentIndices, resolveRef, type BuildIssue, type MeshPart } from './scene';

/**
 * The rig kernel: resolve a design's rig into an ordered bone list, check it against the bone table,
 * and place one automatically from the built parts (`autoRig`).
 *
 * Auto-rig works in a **canonical frame** — x = the model's left, y = up, z = forward (its `facing`) —
 * so one set of rules places bones for a model facing any of the four directions.
 */

export type RigBone = {
  name: string;
  /** Index of the parent in `ResolvedRig.bones`, or `null`. Parents always come before children. */
  parent: number | null;
  head: Vec3;
  tail: Vec3;
};

export type ResolvedRig = {
  anatomy: ModelAnatomy;
  facing: ModelFacing;
  bones: RigBone[];
  byName: Map<string, number>;
  /** Children of each bone. */
  children: number[][];
  falloff: number;
};

export type Basis = { forward: Vec3; up: Vec3; left: Vec3 };

export function facingBasis(facing: ModelFacing = '+z'): Basis {
  const forward: Vec3 = facing === '+z' ? [0, 0, 1] : facing === '-z' ? [0, 0, -1] : facing === '+x' ? [1, 0, 0] : [-1, 0, 0];
  const up: Vec3 = [0, 1, 0];
  return { forward, up, left: v3.cross(up, forward) };
}

/** Model space → canonical (left, up, forward). */
const toCanon = (b: Basis, p: Vec3): Vec3 => [v3.dot(p, b.left), p[1], v3.dot(p, b.forward)];
/** Canonical → model space. */
const fromCanon = (b: Basis, c: Vec3): Vec3 => v3.add(v3.add(v3.scale(b.left, c[0]), [0, c[1], 0]), v3.scale(b.forward, c[2]));

/** The nearest ancestor (by the table) that the rig actually has. */
function tableParent(anatomy: ModelAnatomy, name: string, present: Set<string>): string | null {
  const table = MODEL_BONE_TABLE[anatomy];
  let at = table.find((b) => b.name === name)?.parent ?? null;
  let guard = 0;
  while (at !== null && !present.has(at) && guard++ < 64) at = table.find((b) => b.name === at)?.parent ?? null;
  return at;
}

/**
 * The design's rig as an ordered list, or `null` when it has none (or is static). Unknown names are
 * dropped here — `validateRig` reports them — so a half-valid rig still poses.
 */
export function resolveRig(spec: Pick<ModelSpec, 'anatomy' | 'rig'>): ResolvedRig | null {
  const anatomy = spec.anatomy ?? 'static';
  const rig = spec.rig;
  if (!rig || anatomy === 'static' || rig.bones.length === 0) return null;
  const table = MODEL_BONE_TABLE[anatomy];
  const known = rig.bones.filter((b, i) => table.some((t) => t.name === b.name) && rig.bones.findIndex((o) => o.name === b.name) === i);
  if (known.length === 0) return null;
  const present = new Set(known.map((b) => b.name));
  const parentOf = new Map<string, string | null>();
  for (const b of known) {
    const explicit = b.parent && present.has(b.parent) && b.parent !== b.name ? b.parent : null;
    parentOf.set(b.name, explicit ?? tableParent(anatomy, b.name, present));
  }
  // Break cycles from explicit re-parenting by falling back to the table parent.
  for (const b of known) {
    const seen = new Set([b.name]);
    let at = parentOf.get(b.name) ?? null;
    while (at !== null) {
      if (seen.has(at)) {
        parentOf.set(b.name, tableParent(anatomy, b.name, present));
        break;
      }
      seen.add(at);
      at = parentOf.get(at) ?? null;
    }
  }
  // Order parents first (table order is already parent-first; explicit parents may not be).
  const ordered: ModelBone[] = [];
  const placed = new Set<string>();
  let guard = 0;
  while (ordered.length < known.length && guard++ < known.length + 2) {
    for (const b of known) {
      if (placed.has(b.name)) continue;
      const p = parentOf.get(b.name) ?? null;
      if (p === null || placed.has(p)) {
        ordered.push(b);
        placed.add(b.name);
      }
    }
  }
  const byName = new Map(ordered.map((b, i) => [b.name, i]));
  const bones: RigBone[] = ordered.map((b) => {
    const p = parentOf.get(b.name) ?? null;
    return { name: b.name, parent: p === null ? null : byName.get(p)!, head: [...b.head] as Vec3, tail: [...b.tail] as Vec3 };
  });
  const children = bones.map(() => [] as number[]);
  bones.forEach((b, i) => {
    if (b.parent !== null) children[b.parent]!.push(i);
  });
  return { anatomy, facing: rig.facing ?? '+z', bones, byName, children, falloff: rig.falloff ?? 0.25 };
}

/** Problems with a design's anatomy, rig and clips, as `{path, message}` the repair loop and agents act on. */
export function validateRig(spec: ModelSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const anatomy = spec.anatomy ?? 'static';
  const table = MODEL_BONE_TABLE[anatomy];
  const rig = spec.rig;
  if (rig && rig.bones.length > 0) {
    if (anatomy === 'static') issues.push({ path: 'rig', message: 'A static object has no bones — set "anatomy" to biped, quadruped or vehicle, or remove "rig".' });
    else {
      const seen = new Set<string>();
      rig.bones.forEach((b, i) => {
        const at = `rig.bones[${i}]`;
        if (!table.some((t) => t.name === b.name)) {
          const canonical = canonicalBoneName(anatomy, b.name);
          issues.push({
            path: `${at}.name`,
            message: canonical
              ? `"${b.name}" is not a ${anatomy} bone name — use "${canonical}".`
              : `"${b.name}" is not a ${anatomy} bone name. Valid names: ${table.map((t) => t.name).join(', ')}.`,
          });
        }
        if (seen.has(b.name)) issues.push({ path: `${at}.name`, message: `Bone "${b.name}" appears twice.` });
        seen.add(b.name);
        if (b.parent !== undefined && !rig.bones.some((o) => o.name === b.parent)) issues.push({ path: `${at}.parent`, message: `No bone is named "${b.parent}".` });
        if (b.parent === b.name) issues.push({ path: `${at}.parent`, message: 'A bone cannot be its own parent.' });
      });
      for (const t of table) {
        if (t.required && !seen.has(t.name)) issues.push({ path: 'rig.bones', message: `A ${anatomy} rig needs a "${t.name}" bone.` });
      }
    }
    const index = indexParts(spec.parts);
    for (const [partRef, boneName] of Object.entries(rig.bind ?? {})) {
      if (resolveRef(index, partRef) === null) issues.push({ path: `rig.bind.${partRef}`, message: `No part has id or name "${partRef}".` });
      if (!rig.bones.some((b) => b.name === boneName)) issues.push({ path: `rig.bind.${partRef}`, message: `No bone is named "${boneName}".` });
    }
  }
  const presets = MODEL_CLIP_PRESETS[anatomy];
  const names = new Set<string>();
  (spec.animations ?? []).forEach((clip, i) => {
    const at = `animations[${i}]`;
    if (anatomy === 'static') {
      issues.push({ path: at, message: 'A static object cannot be animated — set "anatomy" first.' });
      return;
    }
    if (names.has(clip.name)) issues.push({ path: `${at}.name`, message: `Another clip is already called "${clip.name}".` });
    names.add(clip.name);
    if (clip.kind !== 'custom' && !presets.includes(clip.kind)) {
      issues.push({ path: `${at}.kind`, message: `"${clip.kind}" is not a ${anatomy} clip. Valid kinds: ${[...presets, 'custom'].join(', ')}.` });
    }
    const { duration } = clipTiming({ ...clip, speed: 1 });
    (clip.keys ?? []).forEach((key, k) => {
      if (rig && !rig.bones.some((b) => b.name === key.bone)) issues.push({ path: `${at}.keys[${k}].bone`, message: `No bone is named "${key.bone}".` });
      if (key.time > duration + 1e-6) issues.push({ path: `${at}.keys[${k}].time`, message: `Key at ${key.time}s is past the clip's ${duration}s.` });
    });
  });
  if ((spec.animations?.length ?? 0) > 0 && anatomy !== 'static' && !(rig && rig.bones.length > 0)) {
    issues.push({ path: 'animations', message: 'Clips need a rig — run auto-rig first.' });
  }
  return issues;
}

// --- auto-rig --------------------------------------------------------------------------------

type CanonPart = { name: string; shape: ModelPart['shape']; points: Vec3[]; centroid: Vec3; min: Vec3; max: Vec3 };

function canonParts(spec: ModelSpec, basis: Basis): { parts: CanonPart[]; min: Vec3; max: Vec3 } {
  const built = buildScene(spec);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const parts: CanonPart[] = built.map((mesh: MeshPart) => {
    const points: Vec3[] = [];
    const pmin: Vec3 = [Infinity, Infinity, Infinity];
    const pmax: Vec3 = [-Infinity, -Infinity, -Infinity];
    let sum: Vec3 = [0, 0, 0];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const c = toCanon(basis, [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]);
      points.push(c);
      sum = v3.add(sum, c);
      for (let k = 0; k < 3; k += 1) {
        pmin[k] = Math.min(pmin[k]!, c[k]!);
        pmax[k] = Math.max(pmax[k]!, c[k]!);
        min[k] = Math.min(min[k]!, c[k]!);
        max[k] = Math.max(max[k]!, c[k]!);
      }
    }
    const source = spec.parts[mesh.sourceIndex]!;
    return { name: source.name.toLowerCase(), shape: source.shape, points, centroid: v3.scale(sum, 1 / Math.max(1, points.length)), min: pmin, max: pmax };
  });
  if (!Number.isFinite(min[0])) return { parts: [], min: [0, 0, 0], max: [1, 1, 1] };
  return { parts, min, max };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** `left`/`right` from a part name, else `null`. */
function nameSide(name: string): 'left' | 'right' | null {
  if (/\bleft\b|^left|left[\s_-]|[\s_.-]l$|^l[\s_.-]|_l_|\.l\b/.test(name)) return 'left';
  if (/\bright\b|^right|right[\s_-]|[\s_.-]r$|^r[\s_.-]|_r_|\.r\b/.test(name)) return 'right';
  return null;
}

const ARM_RE = /arm|hand|fist|glove|elbow|wrist|shoulder|finger|claw/;
const LEG_RE = /leg|thigh|shin|calf|knee|foot|feet|shoe|boot|ankle|toe/;
const HEAD_RE = /\b(head|skull|face|helmet|hat|hair|eyes?|ears?|nose|mouth|jaw|visor|antenna)\b/;

type Placed = { name: string; head: Vec3; tail: Vec3 };

function bipedBones(parts: CanonPart[], min: Vec3, max: Vec3): Placed[] {
  const H = Math.max(1e-6, max[1] - min[1]);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const y = (t: number): number => min[1] + t * H;

  // Head: a part named like one, else the top 13%.
  const headParts = parts.filter((p) => HEAD_RE.test(p.name));
  const headBottom = headParts.length > 0 ? clamp(Math.min(...headParts.map((p) => p.min[1])), y(0.55), y(0.95)) : y(0.87);

  // Crotch: the lowest point of the trunk — parts that straddle the centre line and are not limbs.
  const trunk = parts.filter((p) => !ARM_RE.test(p.name) && !LEG_RE.test(p.name) && !HEAD_RE.test(p.name) && p.min[0] < cx && p.max[0] > cx && p.max[1] > y(0.3));
  const crotch = trunk.length > 0 ? Math.min(...trunk.map((p) => p.min[1])) : Infinity;
  const crotchY = Number.isFinite(crotch) ? clamp(crotch, y(0.3), y(0.6)) : y(0.47);
  const hipsY = crotchY + 0.04 * H;
  const neckY = headBottom - 0.03 * H;
  const T = Math.max(1e-6, neckY - hipsY);
  const spineAt = (t: number): Vec3 => [cx, hipsY + t * T, cz];

  const out: Placed[] = [
    { name: 'root', head: [cx, min[1], cz], tail: [cx, min[1], cz + 0.15 * H] },
    { name: 'hips', head: spineAt(0), tail: spineAt(0.1) },
    { name: 'spine', head: spineAt(0.1), tail: spineAt(0.4) },
    { name: 'chest', head: spineAt(0.4), tail: spineAt(0.7) },
    { name: 'upperChest', head: spineAt(0.7), tail: spineAt(1) },
    { name: 'neck', head: spineAt(1), tail: [cx, headBottom, cz] },
    { name: 'head', head: [cx, headBottom, cz], tail: [cx, max[1], cz] },
  ];

  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const onSide = (p: CanonPart): boolean => (nameSide(p.name) ?? (p.centroid[0] - cx >= 0 ? 'left' : 'right')) === side;

    // Arms: parts named like arms, else narrow parts beside the torso above the hips.
    let armPts = parts.filter((p) => ARM_RE.test(p.name) && onSide(p)).flatMap((p) => p.points);
    if (armPts.length === 0) {
      armPts = parts
        .filter((p) => !HEAD_RE.test(p.name) && !LEG_RE.test(p.name) && onSide(p) && Math.abs(p.centroid[0] - cx) > 0.12 * H && p.centroid[1] > crotchY - 0.1 * H)
        .flatMap((p) => p.points);
    }
    const shoulderTarget: Vec3 = [cx + sign * 0.12 * H, neckY - 0.06 * H, cz];
    let shoulder: Vec3 = shoulderTarget;
    let hand: Vec3 = [cx + sign * 0.2 * H, crotchY, cz];
    if (armPts.length > 0) {
      shoulder = armPts.reduce((best, q) => (v3.len(v3.sub(q, shoulderTarget)) < v3.len(v3.sub(best, shoulderTarget)) ? q : best));
      shoulder = [cx + sign * Math.max(Math.abs(shoulder[0] - cx), 0.08 * H), Math.min(shoulder[1], neckY), cz];
      hand = armPts.reduce((best, q) => (v3.len(v3.sub(q, shoulder)) > v3.len(v3.sub(best, shoulder)) ? q : best));
    }
    const elbow = v3.lerp(shoulder, hand, 0.45);
    const wrist = v3.lerp(shoulder, hand, 0.82);
    const S = side === 'left' ? 'left' : 'right';
    out.push(
      { name: `${S}Shoulder`, head: [cx + sign * 0.02 * H, shoulder[1], cz], tail: shoulder },
      { name: `${S}UpperArm`, head: shoulder, tail: elbow },
      { name: `${S}LowerArm`, head: elbow, tail: wrist },
      { name: `${S}Hand`, head: wrist, tail: hand },
    );

    // Legs: parts named like legs, else anything below the crotch on this side.
    let legPts = parts.filter((p) => LEG_RE.test(p.name) && onSide(p)).flatMap((p) => p.points);
    if (legPts.length === 0) {
      legPts = parts.filter((p) => !ARM_RE.test(p.name) && p.centroid[1] < crotchY && onSide(p)).flatMap((p) => p.points);
    }
    legPts = legPts.filter((q) => sign * (q[0] - cx) > 0);
    const topBand = legPts.filter((q) => q[1] > crotchY - 0.15 * H);
    const meanX = topBand.length > 0 ? topBand.reduce((sum, q) => sum + q[0], 0) / topBand.length : Number.NaN;
    const hipXc = Number.isFinite(meanX) && sign * (meanX - cx) > 0.02 * H ? meanX : cx + sign * 0.09 * H;
    const ankleY = y(0.06);
    const nearAnkle = legPts.filter((q) => Math.abs(q[1] - ankleY) < 0.05 * H);
    const ankleZ = nearAnkle.length > 0 ? nearAnkle.reduce((s, q) => s + q[2], 0) / nearAnkle.length : cz;
    const toeZ = legPts.length > 0 ? Math.max(ankleZ + 0.06 * H, ...legPts.filter((q) => q[1] < y(0.1)).map((q) => q[2])) : ankleZ + 0.12 * H;
    const hip: Vec3 = [hipXc, crotchY, cz];
    const ankle: Vec3 = [hipXc, ankleY, ankleZ];
    const knee: Vec3 = [hipXc, (crotchY + ankleY) / 2, (cz + ankleZ) / 2 + 0.01 * H];
    const ball: Vec3 = [hipXc, y(0.02), lerp(ankleZ, toeZ, 0.65)];
    out.push(
      { name: `${S}UpperLeg`, head: hip, tail: knee },
      { name: `${S}LowerLeg`, head: knee, tail: ankle },
      { name: `${S}Foot`, head: ankle, tail: ball },
      { name: `${S}Toes`, head: ball, tail: [hipXc, y(0.02), toeZ] },
    );
  }
  return out;
}

type Corner = 'FL' | 'FR' | 'RL' | 'RR';
const cornerOf = (p: Vec3, cx: number, cz: number): Corner => `${p[2] >= cz ? 'F' : 'R'}${p[0] >= cx ? 'L' : 'R'}` as Corner;

function vehicleBones(parts: CanonPart[], min: Vec3, max: Vec3): Placed[] {
  const H = Math.max(1e-6, max[1] - min[1]);
  const len = Math.max(1e-6, max[2] - min[2]);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const named = parts.filter((p) => /wheel|tire|tyre|rim|hubcap/.test(p.name) && !/steer/.test(p.name));
  const wheels = named.length > 0 ? named : parts.filter((p) => (p.shape === 'cylinder' || p.shape === 'torus') && p.centroid[1] < min[1] + 0.45 * H);
  const byCorner = new Map<Corner, CanonPart[]>();
  for (const w of wheels) {
    const c = cornerOf(w.centroid, cx, cz);
    byCorner.set(c, [...(byCorner.get(c) ?? []), w]);
  }
  const out: Placed[] = [
    { name: 'root', head: [cx, min[1], cz], tail: [cx, min[1], cz + 0.25 * len] },
    { name: 'body', head: [cx, min[1] + 0.45 * H, cz], tail: [cx, min[1] + 0.45 * H, cz + 0.25 * len] },
  ];
  const steer = parts.find((p) => /steer/.test(p.name));
  if (steer) out.push({ name: 'steering', head: steer.centroid, tail: v3.add(steer.centroid, [0, 0.07 * len, -0.07 * len]) });
  for (const corner of ['FL', 'FR', 'RL', 'RR'] as const) {
    const group = byCorner.get(corner);
    if (!group) continue;
    // The hub: the centre of the group's bounds (tyre and rim share it).
    const gmin = [0, 1, 2].map((k) => Math.min(...group.map((g) => g.min[k]!))) as Vec3;
    const gmax = [0, 1, 2].map((k) => Math.max(...group.map((g) => g.max[k]!))) as Vec3;
    const hub: Vec3 = v3.scale(v3.add(gmin, gmax), 0.5);
    const radius = Math.max(0.01 * H, (gmax[1] - gmin[1]) / 2);
    const outward = corner.endsWith('L') ? 1 : -1;
    out.push(
      { name: `suspension_${corner}`, head: v3.add(hub, [0, radius * 0.8, 0]), tail: hub },
      { name: `wheel_${corner}`, head: hub, tail: v3.add(hub, [outward * radius * 0.5, 0, 0]) },
    );
  }
  return out;
}

function quadrupedBones(parts: CanonPart[], min: Vec3, max: Vec3): Placed[] {
  const H = Math.max(1e-6, max[1] - min[1]);
  const len = Math.max(1e-6, max[2] - min[2]);
  const W = Math.max(1e-6, max[0] - min[0]);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const legs = parts.filter((p) => /leg|paw|hoof|foot|feet|thigh|shin/.test(p.name) || p.centroid[1] < min[1] + 0.35 * H);
  const byCorner = new Map<Corner, Vec3[]>();
  for (const l of legs) {
    const c = cornerOf(l.centroid, cx, cz);
    byCorner.set(c, [...(byCorner.get(c) ?? []), ...l.points]);
  }
  const legTopY = min[1] + 0.6 * H;
  const column = (corner: Corner): { x: number; z: number; top: number } => {
    const pts = byCorner.get(corner);
    const dx = corner.endsWith('L') ? 0.25 * W : -0.25 * W;
    const dz = corner.startsWith('F') ? 0.33 * len : -0.33 * len;
    if (!pts || pts.length === 0) return { x: cx + dx, z: cz + dz, top: legTopY };
    const n = pts.length;
    return { x: pts.reduce((s, q) => s + q[0], 0) / n, z: pts.reduce((s, q) => s + q[2], 0) / n, top: clamp(Math.max(...pts.map((q) => q[1])), min[1] + 0.3 * H, max[1]) };
  };
  const front = column('FL');
  const hind = column('RL');
  const backY = Math.max(front.top, hind.top);
  const headParts = parts.filter((p) => HEAD_RE.test(p.name));
  const headC: Vec3 =
    headParts.length > 0
      ? v3.scale(headParts.reduce((s, p) => v3.add(s, p.centroid), [0, 0, 0] as Vec3), 1 / headParts.length)
      : [cx, min[1] + 0.85 * H, max[2] - 0.1 * len];
  const hipsP: Vec3 = [cx, backY, hind.z];
  const chestP: Vec3 = [cx, backY, front.z];
  const out: Placed[] = [
    { name: 'root', head: [cx, min[1], cz], tail: [cx, min[1], cz + 0.25 * len] },
    { name: 'hips', head: hipsP, tail: v3.lerp(hipsP, chestP, 0.3) },
    { name: 'spine', head: v3.lerp(hipsP, chestP, 0.3), tail: v3.lerp(hipsP, chestP, 0.7) },
    { name: 'chest', head: v3.lerp(hipsP, chestP, 0.7), tail: chestP },
    { name: 'neck', head: chestP, tail: v3.lerp(chestP, headC, 0.7) },
    { name: 'head', head: v3.lerp(chestP, headC, 0.7), tail: v3.add(headC, [0, 0, 0.1 * len]) },
  ];
  for (const corner of ['FL', 'FR', 'RL', 'RR'] as const) {
    const col = column(corner);
    const end = corner.startsWith('F') ? 'Front' : 'Hind';
    const side = corner.endsWith('L') ? 'left' : 'right';
    const top: Vec3 = [col.x, Math.min(col.top, backY), col.z];
    const foot: Vec3 = [col.x, min[1] + 0.05 * H, col.z];
    const knee: Vec3 = [col.x, lerp(foot[1], top[1], 0.5), col.z + (end === 'Front' ? -0.02 : 0.02) * len];
    out.push(
      { name: `${side}${end}UpperLeg`, head: top, tail: knee },
      { name: `${side}${end}LowerLeg`, head: knee, tail: foot },
      { name: `${side}${end}Foot`, head: foot, tail: [col.x, min[1], col.z + 0.04 * len] },
    );
  }
  const tailPts = parts.filter((p) => /tail/.test(p.name)).flatMap((p) => p.points);
  if (tailPts.length > 0) {
    const tip = tailPts.reduce((best, q) => (q[2] < best[2] ? q : best));
    const a = hipsP;
    out.push(
      { name: 'tail1', head: a, tail: v3.lerp(a, tip, 1 / 3) },
      { name: 'tail2', head: v3.lerp(a, tip, 1 / 3), tail: v3.lerp(a, tip, 2 / 3) },
      { name: 'tail3', head: v3.lerp(a, tip, 2 / 3), tail: tip },
    );
  }
  return out;
}

/** The longer horizontal axis, for models whose facing was not given (vehicles and animals are long). */
function guessFacing(spec: ModelSpec, anatomy: ModelAnatomy): ModelFacing {
  if (anatomy === 'biped') return '+z';
  const { min, max } = canonParts(spec, facingBasis('+z'));
  return max[0] - min[0] > (max[2] - min[2]) * 1.15 ? '+x' : '+z';
}

const round4 = (v: Vec3): Vec3 => v.map((n) => Math.round(n * 1e4) / 1e4) as Vec3;

/**
 * Places a rig for `anatomy` from the design's built parts. Bones come from proportions refined by
 * what the parts are called (`left arm`, `wheel_fl`, `tail`) and where they sit. A static anatomy
 * returns `null`. Existing `bind` overrides and `falloff` are kept.
 */
export function autoRig(spec: ModelSpec, anatomy: ModelAnatomy, facing?: ModelFacing): ModelRig | null {
  if (anatomy === 'static') return null;
  const face = facing ?? spec.rig?.facing ?? guessFacing(spec, anatomy);
  const basis = facingBasis(face);
  const { parts, min, max } = canonParts({ ...spec, rig: undefined, animations: undefined }, basis);
  const placed = anatomy === 'biped' ? bipedBones(parts, min, max) : anatomy === 'vehicle' ? vehicleBones(parts, min, max) : quadrupedBones(parts, min, max);
  const bones: ModelBone[] = placed.map((p) => ({ name: p.name, head: round4(fromCanon(basis, p.head)), tail: round4(fromCanon(basis, p.tail)) }));
  return {
    facing: face,
    bones,
    ...(spec.rig?.bind ? { bind: spec.rig.bind } : {}),
    ...(spec.rig?.falloff !== undefined ? { falloff: spec.rig.falloff } : {}),
  };
}

/** The part indices whose binding is inherited from `i`'s ancestors (groups bind their children). */
export function partAncestry(parts: readonly ModelPart[], i: number): number[] {
  const parents = parentIndices(parts);
  const out = [i];
  let at = parents[i] ?? null;
  let guard = 0;
  while (at !== null && guard++ < parts.length) {
    out.push(at);
    at = parents[at] ?? null;
  }
  return out;
}
