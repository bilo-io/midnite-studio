import { describe, expect, it } from 'vitest';

import { ModelSpecSchema, type ModelSpec } from '../media-model';
import {
  BIPED_BONES,
  MODEL_BONE_TABLE,
  MODEL_CLIP_PRESETS,
  QUADRUPED_BONES,
  VEHICLE_BONES,
  canonicalBoneName,
  clipTiming,
  type ModelAnatomy,
  type ModelClip,
} from '../media-model-rig';
import { bakeClip, retargetClips, samplePose } from './clips';
import { type Vec3, applyPoint, v3 } from './math';
import { qRotate } from './quat';
import { autoRig, resolveRig, validateRig, type ResolvedRig } from './rig';
import { RIG_EXAMPLE_BIPED, RIG_EXAMPLE_QUADRUPED, RIG_EXAMPLE_VEHICLE } from './rig-examples';
import { buildScene } from './scene';
import { MAX_INFLUENCES, computeSkin, partBindings, restPose, skinMatrices, skinParts } from './skin';

const memo = new Map<ModelSpec, Map<ModelAnatomy, { spec: ModelSpec; rig: ResolvedRig }>>();
/** Auto-rigged once per (design, anatomy) — building a design is the slow part. */
const rigged = (spec: ModelSpec, anatomy: ModelAnatomy): { spec: ModelSpec; rig: ResolvedRig } => {
  const byAnatomy = memo.get(spec) ?? new Map();
  memo.set(spec, byAnatomy);
  const hit = byAnatomy.get(anatomy);
  if (hit) return hit;
  const withRig = { ...spec, anatomy, rig: autoRig(spec, anatomy)! };
  const out = { spec: withRig, rig: resolveRig(withRig)! };
  byAnatomy.set(anatomy, out);
  return out;
};
const head = (rig: ResolvedRig, name: string): Vec3 => rig.bones[rig.byName.get(name)!]!.head;

describe('bone table', () => {
  it('every anatomy table is parent-first, unique, and mirrors pair up', () => {
    for (const [anatomy, table] of Object.entries(MODEL_BONE_TABLE)) {
      const names = table.map((b) => b.name);
      expect(new Set(names).size, anatomy).toBe(names.length);
      table.forEach((b, i) => {
        if (b.parent !== null) expect(names.indexOf(b.parent), `${anatomy}.${b.name}`).toBeLessThan(i);
        if (b.mirror) expect(table.find((o) => o.name === b.mirror)?.mirror).toBe(b.name);
      });
    }
  });

  it('uses VRM humanoid names for bipeds and corner names for vehicles', () => {
    const biped = BIPED_BONES.map((b) => b.name);
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightLowerLeg', 'leftFoot', 'rightHand']) expect(biped).toContain(n);
    const vehicle = VEHICLE_BONES.map((b) => b.name);
    for (const n of ['body', 'steering', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'suspension_FL']) expect(vehicle).toContain(n);
    expect(QUADRUPED_BONES.map((b) => b.name)).toContain('leftHindFoot');
  });

  it('maps other rigs’ names onto the table', () => {
    expect(canonicalBoneName('biped', 'mixamorig:LeftUpLeg')).toBe('leftUpperLeg');
    expect(canonicalBoneName('biped', 'mixamorig9:RightForeArm')).toBe('rightLowerArm');
    expect(canonicalBoneName('biped', 'thigh_l')).toBe('leftUpperLeg');
    expect(canonicalBoneName('biped', 'pelvis')).toBe('hips');
    expect(canonicalBoneName('biped', 'Head')).toBe('head');
    expect(canonicalBoneName('vehicle', 'wheel_fl')).toBe('wheel_FL');
    expect(canonicalBoneName('biped', 'tentacle')).toBeNull();
  });

  it('old designs (no anatomy/rig/animations) still parse unchanged', () => {
    const parsed = ModelSpecSchema.parse({ name: 'x', parts: [{ shape: 'box', size: [1, 1, 1] }] });
    expect(parsed).not.toHaveProperty('anatomy');
    expect(parsed).not.toHaveProperty('rig');
    expect(resolveRig(parsed)).toBeNull();
  });
});

describe('auto-rig', () => {
  it('places a full, valid biped rig in the right places', () => {
    const { spec, rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    expect(validateRig(spec)).toEqual([]);
    for (const b of BIPED_BONES) expect(rig.byName.has(b.name), b.name).toBe(true);
    // Up the spine, head on top.
    expect(head(rig, 'hips')[1]).toBeGreaterThan(0.75);
    expect(head(rig, 'hips')[1]).toBeLessThan(1.0);
    expect(head(rig, 'head')[1]).toBeGreaterThan(head(rig, 'neck')[1]);
    // Left is +X (VRM), arms out at the shoulders, hands near the hand parts.
    expect(head(rig, 'leftUpperArm')[0]).toBeGreaterThan(0.15);
    expect(head(rig, 'rightUpperArm')[0]).toBeLessThan(-0.15);
    expect(v3.len(v3.sub(rig.bones[rig.byName.get('leftHand')!]!.tail, [0.3, 0.75, 0]))).toBeLessThan(0.15);
    // Legs: hip above knee above ankle, on their own side.
    expect(head(rig, 'leftUpperLeg')[1]).toBeGreaterThan(head(rig, 'leftLowerLeg')[1]);
    expect(head(rig, 'leftLowerLeg')[1]).toBeGreaterThan(head(rig, 'leftFoot')[1]);
    expect(head(rig, 'leftUpperLeg')[0]).toBeCloseTo(0.1, 1);
    expect(head(rig, 'rightUpperLeg')[0]).toBeCloseTo(-0.1, 1);
  });

  it('finds the four wheels and the steering wheel of a vehicle', () => {
    const { spec, rig } = rigged(RIG_EXAMPLE_VEHICLE, 'vehicle');
    expect(validateRig(spec)).toEqual([]);
    expect(head(rig, 'wheel_FL')[0]).toBeCloseTo(0.85, 1);
    expect(head(rig, 'wheel_FL')[2]).toBeCloseTo(1.35, 1);
    expect(head(rig, 'wheel_RR')[0]).toBeCloseTo(-0.85, 1);
    expect(head(rig, 'wheel_RR')[2]).toBeCloseTo(-1.35, 1);
    expect(head(rig, 'wheel_FL')[1]).toBeCloseTo(0.32, 1);
    expect(rig.byName.has('steering')).toBe(true);
  });

  it('guesses which way a long model faces and names the corners from it', () => {
    // The same car turned to drive along +X.
    const turned = ModelSpecSchema.parse({
      ...RIG_EXAMPLE_VEHICLE,
      parts: RIG_EXAMPLE_VEHICLE.parts.map((p) => ({ ...p, position: [p.position[2], p.position[1], -p.position[0]] as Vec3, rotation: [0, 90, p.rotation[2]] as Vec3 })),
    });
    const rig = autoRig(turned, 'vehicle')!;
    expect(rig.facing).toBe('+x');
    const fl = rig.bones.find((b) => b.name === 'wheel_FL')!;
    expect(fl.head[0]).toBeCloseTo(1.35, 1);
    expect(fl.head[2]).toBeCloseTo(-0.85, 1);
  });

  it('rigs a quadruped with four legs and a tail', () => {
    const { spec, rig } = rigged(RIG_EXAMPLE_QUADRUPED, 'quadruped');
    expect(validateRig(spec)).toEqual([]);
    expect(head(rig, 'leftFrontUpperLeg')[2]).toBeGreaterThan(0);
    expect(head(rig, 'leftHindUpperLeg')[2]).toBeLessThan(0);
    expect(head(rig, 'leftFrontUpperLeg')[0]).toBeGreaterThan(0);
    expect(rig.byName.has('tail3')).toBe(true);
  });

  it('a static anatomy has no rig', () => {
    expect(autoRig(RIG_EXAMPLE_BIPED, 'static')).toBeNull();
  });

  it('prevents auto-rig arm bones from crossing over body on models with mirrored or instanced arms', () => {
    // Model with right arm group instanced on the left with negative X scale, and generic part names.
    const nonArmParts = RIG_EXAMPLE_BIPED.parts.filter((p) => !/arm|hand/.test(p.name));
    const instancedArmSpec = ModelSpecSchema.parse({
      name: 'instanced-arms-biped',
      parts: [
        ...nonArmParts,
        { id: 'armR', name: 'right arm', shape: 'group', position: [0, 0, 0] },
        { name: 'deltoid', shape: 'sphere', radius: 0.08, segments: 8, position: [-0.28, 1.39, 0], parent: 'armR' },
        { name: 'upper arm', shape: 'capsule', radius: 0.05, height: 0.2, segments: 8, position: [-0.3, 1.23, 0], parent: 'armR' },
        { name: 'forearm', shape: 'capsule', radius: 0.04, height: 0.2, segments: 8, position: [-0.35, 0.95, 0], parent: 'armR' },
        { name: 'hand', shape: 'sphere', radius: 0.05, segments: 8, position: [-0.38, 0.75, 0], parent: 'armR' },
        { name: 'left arm', shape: 'instance', source: 'armR', scale: [-1, 1, 1], position: [0, 0, 0] },
      ],
    });
    const rig = autoRig(instancedArmSpec, 'biped')!;
    expect(rig).not.toBeNull();
    const armBoneNames = ['Shoulder', 'UpperArm', 'LowerArm', 'Hand'];
    for (const suffix of armBoneNames) {
      const leftBone = rig.bones.find((b) => b.name === `left${suffix}`)!;
      const rightBone = rig.bones.find((b) => b.name === `right${suffix}`)!;
      expect(leftBone, `left${suffix}`).toBeDefined();
      expect(rightBone, `right${suffix}`).toBeDefined();
      // Left arm bones strictly on the +X side.
      expect(leftBone.head[0], `left${suffix} head X`).toBeGreaterThan(0);
      expect(leftBone.tail[0], `left${suffix} tail X`).toBeGreaterThan(0);
      // Right arm bones strictly on the -X side.
      expect(rightBone.head[0], `right${suffix} head X`).toBeLessThan(0);
      expect(rightBone.tail[0], `right${suffix} tail X`).toBeLessThan(0);
    }
  });

  it('prevents auto-rig arm bones from crossing over body with generic arm names on both sides', () => {
    // Both sides have parts with generic names (no 'left' or 'right' in part names).
    const nonArmParts = RIG_EXAMPLE_BIPED.parts.filter((p) => !/arm|hand/.test(p.name));
    const genericArmSpec = ModelSpecSchema.parse({
      name: 'generic-arms-biped',
      parts: [
        ...nonArmParts,
        { name: 'upper arm', shape: 'capsule', radius: 0.05, height: 0.2, segments: 8, position: [0.3, 1.27, 0] },
        { name: 'forearm', shape: 'capsule', radius: 0.04, height: 0.2, segments: 8, position: [0.35, 0.98, 0] },
        { name: 'hand', shape: 'sphere', radius: 0.05, segments: 8, position: [0.38, 0.78, 0] },
        { name: 'upper arm', shape: 'capsule', radius: 0.05, height: 0.2, segments: 8, position: [-0.3, 1.27, 0] },
        { name: 'forearm', shape: 'capsule', radius: 0.04, height: 0.2, segments: 8, position: [-0.35, 0.98, 0] },
        { name: 'hand', shape: 'sphere', radius: 0.05, segments: 8, position: [-0.38, 0.78, 0] },
      ],
    });
    const rig = autoRig(genericArmSpec, 'biped')!;
    expect(rig).not.toBeNull();
    const armBoneNames = ['Shoulder', 'UpperArm', 'LowerArm', 'Hand'];
    for (const suffix of armBoneNames) {
      const leftBone = rig.bones.find((b) => b.name === `left${suffix}`)!;
      const rightBone = rig.bones.find((b) => b.name === `right${suffix}`)!;
      expect(leftBone, `left${suffix}`).toBeDefined();
      expect(rightBone, `right${suffix}`).toBeDefined();
      // Left arm bones strictly on the +X side.
      expect(leftBone.head[0], `left${suffix} head X`).toBeGreaterThan(0);
      expect(leftBone.tail[0], `left${suffix} tail X`).toBeGreaterThan(0);
      // Right arm bones strictly on the -X side.
      expect(rightBone.head[0], `right${suffix} head X`).toBeLessThan(0);
      expect(rightBone.tail[0], `right${suffix} tail X`).toBeLessThan(0);
    }
  });
});

describe('validateRig', () => {
  it('names the right bone for a wrong spelling and reports missing ones', () => {
    const spec = ModelSpecSchema.parse({
      ...RIG_EXAMPLE_BIPED,
      anatomy: 'biped',
      rig: { bones: [{ name: 'root', head: [0, 0, 0], tail: [0, 0, 0.1] }, { name: 'mixamorig:Hips', head: [0, 1, 0], tail: [0, 1.1, 0] }] },
      animations: [{ name: 'go', kind: 'drive' }],
    });
    const issues = validateRig(spec);
    expect(issues.find((i) => i.path === 'rig.bones[1].name')?.message).toContain('"hips"');
    expect(issues.some((i) => i.message.includes('needs a "head" bone'))).toBe(true);
    expect(issues.find((i) => i.path === 'animations[0].kind')?.message).toContain('not a biped clip');
  });

  it('refuses clips without a rig and rigs on a static object', () => {
    const noRig = ModelSpecSchema.parse({ ...RIG_EXAMPLE_BIPED, anatomy: 'biped', animations: [{ name: 'idle', kind: 'idle' }] });
    expect(validateRig(noRig).map((i) => i.path)).toContain('animations');
    const staticRig = ModelSpecSchema.parse({ ...RIG_EXAMPLE_BIPED, rig: autoRig(RIG_EXAMPLE_BIPED, 'biped')! });
    expect(validateRig(staticRig).map((i) => i.path)).toContain('rig');
  });
});

describe('skin weights', () => {
  it('every vertex has at most 4 influences summing to 1', () => {
    for (const [example, anatomy] of [
      [RIG_EXAMPLE_BIPED, 'biped'],
      [RIG_EXAMPLE_VEHICLE, 'vehicle'],
      [RIG_EXAMPLE_QUADRUPED, 'quadruped'],
    ] as const) {
      const { spec, rig } = rigged(example, anatomy);
      const parts = buildScene(spec);
      const skins = computeSkin(spec, rig, parts);
      const problems: string[] = [];
      skins.forEach((skin, pi) => {
        const count = parts[pi]!.positions.length / 3;
        if (skin.weights.length !== count * MAX_INFLUENCES) problems.push(`${pi}: length`);
        for (let v = 0; v < count; v += 1) {
          const w = skin.weights.slice(v * 4, v * 4 + 4);
          const sum = w.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 1) > 1e-6 || Math.min(...w) < 0) problems.push(`${anatomy} part ${pi} vertex ${v}: ${w.join(',')}`);
          if (skin.joints.slice(v * 4, v * 4 + 4).some((j) => j >= rig.bones.length)) problems.push(`${pi}/${v}: joint`);
        }
      });
      expect(problems.slice(0, 5)).toEqual([]);
    }
  });

  it('binds parts by their names and positions', () => {
    const { spec, rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    const parts = buildScene(spec);
    const bound = partBindings(spec, rig, parts).map((b) => rig.bones[b]!.name);
    const named = (n: string): string => bound[parts.findIndex((p) => p.name === n)]!;
    expect(named('head')).toBe('head');
    expect(named('left forearm')).toBe('leftLowerArm');
    expect(named('right shin')).toBe('rightLowerLeg');
    const car = rigged(RIG_EXAMPLE_VEHICLE, 'vehicle');
    const carParts = buildScene(car.spec);
    const carBound = partBindings(car.spec, car.rig, carParts).map((b) => car.rig.bones[b]!.name);
    expect(carBound[carParts.findIndex((p) => p.name === 'wheel front right')]).toBe('wheel_FR');
    expect(carBound[carParts.findIndex((p) => p.name === 'cabin')]).toBe('body');
    expect(carBound[carParts.findIndex((p) => p.name === 'steering wheel')]).toBe('steering');
  });

  it('an explicit bind wins, and falloff 0 is rigid', () => {
    const base = rigged(RIG_EXAMPLE_BIPED, 'biped').spec;
    const spec = { ...base, rig: { ...base.rig!, bind: { 'left thigh': 'hips' }, falloff: 0 } };
    const rig = resolveRig(spec)!;
    const parts = buildScene(spec);
    const skins = computeSkin(spec, rig, parts);
    const thigh = parts.findIndex((p) => p.name === 'left thigh');
    expect(rig.bones[skins[thigh]!.bone]!.name).toBe('hips');
    expect(skins.every((skin) => skin.weights.every((w, k) => (k % 4 === 0 ? w === 1 : w === 0)))).toBe(true);
  });

  it('the rest pose leaves every vertex where it was', () => {
    const { spec, rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    const parts = buildScene(spec);
    const posed = skinParts(parts, computeSkin(spec, rig, parts), skinMatrices(rig, restPose(rig)));
    let worst = 0;
    posed.forEach((p, i) => p.positions.forEach((n, k) => (worst = Math.max(worst, Math.abs(n - parts[i]!.positions[k]!)))));
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('clips', () => {
  const cases: [ModelSpec, ModelAnatomy][] = [
    [RIG_EXAMPLE_BIPED, 'biped'],
    [RIG_EXAMPLE_VEHICLE, 'vehicle'],
    [RIG_EXAMPLE_QUADRUPED, 'quadruped'],
  ];
  for (const [example, anatomy] of cases) {
    for (const kind of MODEL_CLIP_PRESETS[anatomy]) {
      it(`${anatomy} ${kind} samples finite poses that move something`, () => {
        const { rig } = rigged(example, anatomy);
        const clip: ModelClip = { name: kind, kind };
        const { duration } = clipTiming(clip);
        let moved = 0;
        for (let i = 0; i <= 8; i += 1) {
          const pose = samplePose(rig, clip, (duration * i) / 8);
          expect(pose).toHaveLength(rig.bones.length);
          for (const bp of pose) {
            for (const n of [...bp.rotation, ...bp.translation]) expect(Number.isFinite(n)).toBe(true);
            expect(Math.hypot(...bp.rotation)).toBeCloseTo(1, 6);
            moved = Math.max(moved, 1 - Math.abs(bp.rotation[3]), v3.len(bp.translation));
          }
        }
        expect(moved).toBeGreaterThan(0.001);
      });
    }
  }

  it('a walk swings the legs in opposition and loops seamlessly', () => {
    const { rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    const clip: ModelClip = { name: 'walk', kind: 'walk' };
    const { duration } = clipTiming(clip);
    const shinDir = (t: number, leg: string): Vec3 => {
      const i = rig.byName.get(leg)!;
      const b = rig.bones[i]!;
      return qRotate(samplePose(rig, clip, t)[i]!.rotation, v3.norm(v3.sub(b.tail, b.head)));
    };
    const quarter = duration / 4;
    expect(shinDir(quarter, 'leftUpperLeg')[2]).toBeGreaterThan(0.2); // left thigh forward
    expect(shinDir(quarter, 'rightUpperLeg')[2]).toBeLessThan(-0.2); // right thigh back
    const a = samplePose(rig, clip, 0);
    const b = samplePose(rig, clip, duration);
    a.forEach((bp, i) => bp.rotation.forEach((n, k) => expect(Math.abs(n)).toBeCloseTo(Math.abs(b[i]!.rotation[k]!), 6)));
  });

  it('the hand ends up below the shoulder when a T-posed biped idles', () => {
    const spec = ModelSpecSchema.parse({
      ...RIG_EXAMPLE_BIPED,
      parts: RIG_EXAMPLE_BIPED.parts.map((p) =>
        /arm|hand/.test(p.name) ? { ...p, rotation: [0, 0, 90], position: [Math.sign(p.position[0]) * (0.3 + (1.27 - p.position[1])), 1.38, 0] } : p,
      ),
    });
    const { rig, spec: withRig } = rigged(spec, 'biped');
    const parts = buildScene(withRig);
    const matrices = skinMatrices(rig, samplePose(rig, { name: 'idle', kind: 'idle' }, 0));
    const hand = rig.byName.get('leftHand')!;
    const tip = applyPoint(matrices[hand]!, rig.bones[hand]!.tail);
    expect(tip[1]).toBeLessThan(head(rig, 'leftUpperArm')[1] - 0.3);
    expect(parts.length).toBeGreaterThan(0);
  });

  it('additive keys rotate their bone on top of the motion', () => {
    const { rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    const plain = samplePose(rig, { name: 'c', kind: 'custom', duration: 1 }, 0.5);
    expect(plain.every((bp) => bp.rotation[3] === 1)).toBe(true);
    const keyed = samplePose(rig, { name: 'c', kind: 'custom', duration: 1, keys: [{ bone: 'head', time: 0, rotation: [0, 0, 0] }, { bone: 'head', time: 1, rotation: [0, 90, 0] }] }, 0.5);
    expect(keyed[rig.byName.get('head')!]!.rotation[1]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
  });

  it('root motion moves the root only when not in place', () => {
    const { rig } = rigged(RIG_EXAMPLE_BIPED, 'biped');
    const root = rig.byName.get('root')!;
    expect(v3.len(samplePose(rig, { name: 'd', kind: 'dash' }, 0.4)[root]!.translation)).toBe(0);
    expect(samplePose(rig, { name: 'd', kind: 'dash', inPlace: false }, 0.4)[root]!.translation[2]).toBeGreaterThan(0.5);
  });

  it('bakes at 30 fps with sign-continuous quaternions', () => {
    const { rig } = rigged(RIG_EXAMPLE_VEHICLE, 'vehicle');
    const baked = bakeClip(rig, { name: 'drive', kind: 'drive' });
    expect(baked.times[0]).toBe(0);
    expect(baked.times.at(-1)).toBeCloseTo(baked.duration, 5);
    expect(baked.times).toHaveLength(Math.round(baked.duration * 30) + 1);
    for (const track of baked.rotations) {
      for (let i = 1; i < track.length; i += 1) {
        const [a, b] = [track[i - 1]!, track[i]!];
        expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]).toBeGreaterThan(0);
      }
    }
  });

  it('retargets keys by canonical name and scales translations by leg length', () => {
    const small = rigged(RIG_EXAMPLE_BIPED, 'biped').rig;
    const bigSpec = ModelSpecSchema.parse({
      ...RIG_EXAMPLE_BIPED,
      parts: RIG_EXAMPLE_BIPED.parts.map((p) => ({ ...p, position: v3.scale(p.position, 2), scale: [2, 2, 2] })),
    });
    const big = rigged(bigSpec, 'biped').rig;
    const [out] = retargetClips(small, big, [
      { name: 'c', kind: 'custom', keys: [{ bone: 'hips', time: 0, translation: [0, 0.1, 0] }, { bone: 'mixamorig:Head', time: 0, rotation: [10, 0, 0] }, { bone: 'tail1', time: 0 }] },
    ]);
    expect(out!.keys!.map((k) => k.bone)).toEqual(['hips', 'head']);
    expect(out!.keys![0]!.translation![1]).toBeCloseTo(0.2, 1);
    expect(retargetClips(small, rigged(RIG_EXAMPLE_VEHICLE, 'vehicle').rig, [{ name: 'w', kind: 'walk' }])).toEqual([]);
  });
});
