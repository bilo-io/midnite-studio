import { clipTiming, MODEL_BONE_TABLE, canonicalBoneName, type ModelClip, type ModelClipKey } from '../media-model-rig';
import { type Vec3, v3 } from './math';
import { type Quat, qAxisAngle, qFromEulerDeg, qIdentity, qMul, qNormalize, qRotate, qSlerp } from './quat';
import { facingBasis, type ResolvedRig } from './rig';
import { type Pose, restPose } from './skin';

/**
 * Procedural clips. A clip is a *kind* plus parameters; `samplePose` generates the motion for any rig
 * of the right anatomy from its own proportions (stride from leg length, wheel spin from wheel radius),
 * then adds the clip's pose-mode `keys` on top. `bakeClip` samples it at a fixed rate for export.
 *
 * Motions are written against named bones from the table and skip any bone the rig lacks, so a rig
 * without `upperChest` or `leftToes` still animates.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Smooth 0→1 over `[a, b]`. */
const ramp = (u: number, a: number, b: number): number => {
  const t = clamp01((u - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 over `[a, b]` (half a sine). */
const bump = (u: number, a: number, b: number): number => (u <= a || u >= b ? 0 : Math.sin((Math.PI * (u - a)) / (b - a)));

type Dir = 'forward' | 'back' | 'up' | 'down' | 'out' | 'in';

class PoseBuilder {
  readonly pose: Pose;
  readonly forward: Vec3;
  readonly left: Vec3;
  readonly up: Vec3 = [0, 1, 0];
  /** Hip height above the root — the rig's scale for strides and hops. */
  readonly legLength: number;
  readonly height: number;

  constructor(readonly rig: ResolvedRig) {
    this.pose = restPose(rig);
    const basis = facingBasis(rig.facing);
    this.forward = basis.forward;
    this.left = basis.left;
    const root = rig.bones[0]!.head;
    const hips = rig.byName.get('hips') ?? rig.byName.get('body');
    this.legLength = Math.max(0.05, hips === undefined ? 0.5 : rig.bones[hips]!.head[1] - root[1]);
    const top = Math.max(...rig.bones.map((b) => Math.max(b.head[1], b.tail[1])));
    this.height = Math.max(0.1, top - root[1]);
  }

  private at(name: string): number | undefined {
    return this.rig.byName.get(name);
  }

  private sideOf(name: string): number {
    const b = this.rig.bones[this.at(name)!]!;
    const lateral = v3.dot(v3.sub(b.head, this.rig.bones[0]!.head), this.left);
    return lateral >= 0 ? 1 : -1;
  }

  private target(name: string, dir: Dir): Vec3 {
    switch (dir) {
      case 'forward':
        return this.forward;
      case 'back':
        return v3.scale(this.forward, -1);
      case 'up':
        return this.up;
      case 'down':
        return [0, -1, 0];
      case 'out':
        return v3.scale(this.left, this.sideOf(name));
      case 'in':
        return v3.scale(this.left, -this.sideOf(name));
    }
  }

  /** The bone's direction after the rotation it has so far. */
  private direction(i: number): Vec3 {
    const b = this.rig.bones[i]!;
    return qRotate(this.pose[i]!.rotation, v3.norm(v3.sub(b.tail, b.head)));
  }

  /** Swing a bone's tail toward `dir` by `degrees` (negative swings away). */
  swing(name: string, dir: Dir, degrees: number): this {
    const i = this.at(name);
    if (i === undefined || Math.abs(degrees) < 1e-6) return this;
    const axis = v3.cross(this.direction(i), this.target(name, dir));
    if (v3.len(axis) < 1e-4) return this;
    return this.rotate(i, axis, degrees);
  }

  /** Turn a bone about a model axis: `up` (yaw toward the left), `left` (pitch forward), `forward` (roll right). */
  turn(name: string, axis: 'up' | 'left' | 'forward' | 'self', degrees: number): this {
    const i = this.at(name);
    if (i === undefined || Math.abs(degrees) < 1e-6) return this;
    const a = axis === 'up' ? this.up : axis === 'left' ? this.left : axis === 'forward' ? this.forward : this.direction(i);
    return this.rotate(i, a, degrees);
  }

  private rotate(i: number, axis: Vec3, degrees: number): this {
    const p = this.pose[i]!;
    p.rotation = qNormalize(qMul(qAxisAngle(axis, degrees * DEG), p.rotation));
    return this;
  }

  /** Offset a bone along model axes, in units of the rig's leg length. */
  move(name: string, forward: number, up: number, left = 0): this {
    const i = this.at(name);
    if (i === undefined) return this;
    const d = v3.add(v3.add(v3.scale(this.forward, forward * this.legLength), v3.scale(this.up, up * this.legLength)), v3.scale(this.left, left * this.legLength));
    this.pose[i]!.translation = v3.add(this.pose[i]!.translation, d);
    return this;
  }

  /** Bring T-posed arms down to the sides before any arm motion (no-op for arms already hanging). */
  relaxArms(): this {
    for (const s of ['left', 'right'] as const) {
      const i = this.at(`${s}UpperArm`);
      if (i === undefined) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, v3.dot(this.direction(i), [0, -1, 0])))) / DEG;
      if (angle > 20) this.swing(`${s}UpperArm`, 'down', angle - 12);
    }
    return this;
  }

  has(name: string): boolean {
    return this.at(name) !== undefined;
  }

  /** Radius of a wheel: its hub height above the root. */
  wheelRadius(name: string): number {
    const i = this.at(name);
    if (i === undefined) return 0.3;
    return Math.max(0.02, this.rig.bones[i]!.head[1] - this.rig.bones[0]!.head[1]);
  }
}

// --- bipeds ----------------------------------------------------------------------------------

function gait(b: PoseBuilder, u: number, amp: number, run: boolean): void {
  const p = TAU * u;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const legSwing = (run ? 42 : 26) * amp;
  const knee = run ? 75 : 40;
  b.relaxArms();
  b.swing('leftUpperLeg', 'forward', legSwing * s).swing('rightUpperLeg', 'forward', -legSwing * s);
  b.swing('leftLowerLeg', 'back', ((run ? 20 : 6) + knee * Math.max(0, c)) * amp);
  b.swing('rightLowerLeg', 'back', ((run ? 20 : 6) + knee * Math.max(0, -c)) * amp);
  b.swing('leftFoot', 'up', 12 * amp * Math.max(0, s)).swing('rightFoot', 'up', 12 * amp * Math.max(0, -s));
  const armSwing = (run ? 38 : 20) * amp;
  b.swing('leftUpperArm', 'forward', -armSwing * s).swing('rightUpperArm', 'forward', armSwing * s);
  const elbow = (run ? 75 : 15) * amp;
  b.swing('leftLowerArm', 'forward', elbow + (run ? 10 : 8) * amp * Math.max(0, -s));
  b.swing('rightLowerArm', 'forward', elbow + (run ? 10 : 8) * amp * Math.max(0, s));
  b.turn('hips', 'up', 5 * amp * s).turn('spine', 'up', -4 * amp * s).turn('chest', 'up', -3 * amp * s);
  b.turn('hips', 'forward', 3 * amp * c);
  b.move('hips', 0, (run ? 0.06 : 0.025) * amp * Math.cos(2 * p) - (run ? 0.05 : 0.01) * amp);
  if (run) b.turn('spine', 'left', 10 * amp).turn('head', 'left', -6 * amp);
}

const BIPED: Record<string, (b: PoseBuilder, u: number, amp: number) => void> = {
  idle(b, u, amp) {
    const s = Math.sin(TAU * u);
    b.relaxArms();
    b.turn('chest', 'left', -2 * amp * s).turn('spine', 'left', 1 * amp * s);
    b.move('hips', 0, -0.006 * amp * (1 - Math.cos(TAU * u)));
    b.turn('head', 'up', 4 * amp * Math.sin(TAU * u + 1)).turn('neck', 'left', 1.5 * amp * s);
    b.swing('leftUpperArm', 'out', 3 * amp * (1 + s)).swing('rightUpperArm', 'out', 3 * amp * (1 + s));
    b.swing('leftLowerArm', 'forward', 8 * amp).swing('rightLowerArm', 'forward', 8 * amp);
  },
  walk: (b, u, amp) => gait(b, u, amp, false),
  run: (b, u, amp) => gait(b, u, amp, true),
  getHit(b, u, amp) {
    const e = u < 0.15 ? ramp(u, 0, 0.15) : 1 - ramp(u, 0.15, 1);
    b.relaxArms();
    b.turn('spine', 'left', -12 * amp * e).turn('chest', 'left', -10 * amp * e).turn('head', 'left', -18 * amp * e);
    b.move('hips', -0.05 * amp * e, -0.03 * amp * e);
    b.swing('leftUpperArm', 'forward', 25 * amp * e).swing('rightUpperArm', 'forward', 25 * amp * e);
    b.swing('leftLowerArm', 'forward', 40 * amp * e).swing('rightLowerArm', 'forward', 40 * amp * e);
    b.swing('leftLowerLeg', 'back', 15 * amp * e).swing('rightLowerLeg', 'back', 15 * amp * e);
  },
  fallAndGetUp(b, u, amp) {
    const down = ramp(u, 0, 0.22) * (1 - ramp(u, 0.55, 0.95));
    const rise = bump(u, 0.55, 0.95);
    b.relaxArms();
    b.turn('root', 'left', -88 * down);
    b.move('root', 0, 0.12 * down);
    b.swing('leftUpperArm', 'out', 40 * amp * bump(u, 0, 0.3)).swing('rightUpperArm', 'out', 40 * amp * bump(u, 0, 0.3));
    b.swing('leftUpperLeg', 'forward', 80 * rise).swing('rightUpperLeg', 'forward', 80 * rise);
    b.swing('leftLowerLeg', 'back', 110 * rise).swing('rightLowerLeg', 'back', 110 * rise);
    b.turn('spine', 'left', 35 * rise).turn('chest', 'left', 15 * rise);
    b.swing('leftUpperArm', 'forward', 40 * rise).swing('rightUpperArm', 'forward', 40 * rise);
    b.turn('head', 'left', 6 * amp * Math.sin(TAU * 3 * u) * bump(u, 0.22, 0.55));
  },
  die(b, u, amp) {
    const recoil = bump(u, 0, 0.3);
    const buckle = ramp(u, 0.15, 0.55);
    const fall = ramp(u, 0.4, 0.95);
    b.relaxArms();
    b.turn('spine', 'left', -15 * amp * recoil).turn('head', 'left', -20 * amp * recoil);
    b.move('hips', 0, -0.35 * buckle * (1 - fall));
    b.swing('leftUpperLeg', 'forward', 60 * buckle * (1 - fall)).swing('rightUpperLeg', 'forward', 55 * buckle * (1 - fall));
    b.swing('leftLowerLeg', 'back', 110 * buckle * (1 - fall)).swing('rightLowerLeg', 'back', 100 * buckle * (1 - fall));
    b.turn('root', 'left', 86 * fall);
    b.move('root', 0, 0.1 * fall);
    b.swing('leftUpperArm', 'out', 50 * fall).swing('rightUpperArm', 'out', 45 * fall);
    b.turn('head', 'up', 30 * fall);
  },
  jump(b, u, amp) {
    const crouch = bump(u, 0, 0.25) + bump(u, 0.72, 1) * 0.8;
    const air = bump(u, 0.2, 0.78);
    b.relaxArms();
    b.move('hips', 0.03 * crouch, -0.18 * crouch);
    b.swing('leftUpperLeg', 'forward', 45 * crouch + 25 * air).swing('rightUpperLeg', 'forward', 45 * crouch + 25 * air);
    b.swing('leftLowerLeg', 'back', 70 * crouch + 40 * air).swing('rightLowerLeg', 'back', 70 * crouch + 40 * air);
    b.turn('spine', 'left', 18 * crouch);
    b.swing('leftUpperArm', 'forward', -30 * crouch + 110 * amp * air).swing('rightUpperArm', 'forward', -30 * crouch + 110 * amp * air);
    b.move('root', 0, 0.55 * amp * air);
  },
  doubleJump(b, u, amp) {
    const crouch = bump(u, 0, 0.18) + bump(u, 0.82, 1) * 0.8;
    const first = bump(u, 0.14, 0.5);
    const second = bump(u, 0.38, 0.86);
    const flip = ramp(u, 0.42, 0.8);
    b.relaxArms();
    b.move('hips', 0, -0.18 * crouch);
    const tuck = Math.max(first * 0.5, second);
    b.swing('leftUpperLeg', 'forward', 45 * crouch + 70 * tuck).swing('rightUpperLeg', 'forward', 45 * crouch + 70 * tuck);
    b.swing('leftLowerLeg', 'back', 70 * crouch + 100 * tuck).swing('rightLowerLeg', 'back', 70 * crouch + 100 * tuck);
    b.swing('leftUpperArm', 'forward', 100 * amp * first + 40 * second).swing('rightUpperArm', 'forward', 100 * amp * first + 40 * second);
    b.turn('hips', 'left', 360 * flip);
    b.move('root', 0, 0.45 * amp * first + 0.8 * amp * second);
  },
  dodge(b, u, amp, inPlace = true) {
    const e = bump(u, 0, 1);
    b.relaxArms();
    if (inPlace) b.move('hips', 0, -0.12 * e, 0.45 * amp * e);
    else {
      b.move('root', 0, 0, 0.9 * amp * ramp(u, 0, 0.6));
      b.move('hips', 0, -0.12 * e);
    }
    b.turn('spine', 'forward', 14 * amp * e).turn('chest', 'forward', 8 * amp * e);
    b.swing('leftUpperLeg', 'out', 22 * e).swing('rightUpperLeg', 'in', 8 * e);
    b.swing('leftLowerLeg', 'back', 30 * e).swing('rightLowerLeg', 'back', 45 * e);
    b.swing('leftUpperArm', 'out', 30 * e).swing('rightUpperArm', 'forward', 30 * e);
  },
  dash(b, u, amp, inPlace = true) {
    const e = bump(u, 0, 1);
    b.relaxArms();
    b.turn('hips', 'left', 15 * amp * e).turn('spine', 'left', 15 * amp * e);
    b.swing('leftUpperLeg', 'forward', 45 * e).swing('rightUpperLeg', 'forward', -35 * e);
    b.swing('leftLowerLeg', 'back', 60 * e).swing('rightLowerLeg', 'back', 30 * e);
    b.swing('leftUpperArm', 'forward', -50 * e).swing('rightUpperArm', 'forward', -50 * e);
    if (inPlace) b.move('hips', 0.15 * amp * e, -0.05 * e);
    else b.move('root', 3 * amp * ramp(u, 0, 0.8), 0);
  },
};

// --- quadrupeds ------------------------------------------------------------------------------

const QUADRUPED: Record<string, (b: PoseBuilder, u: number, amp: number) => void> = {
  idle(b, u, amp) {
    const s = Math.sin(TAU * u);
    b.turn('chest', 'left', 1.5 * amp * s).move('hips', 0, 0.006 * amp * s);
    b.turn('head', 'up', 6 * amp * Math.sin(TAU * u + 1)).turn('neck', 'left', 3 * amp * s);
    b.turn('tail1', 'up', 12 * amp * s).turn('tail2', 'up', 10 * amp * Math.sin(TAU * u - 0.6));
  },
  walk: (b, u, amp) => quadGait(b, u, amp, false),
  run: (b, u, amp) => quadGait(b, u, amp, true),
};

function quadGait(b: PoseBuilder, u: number, amp: number, run: boolean): void {
  const p = TAU * u;
  const legs: [string, number][] = run
    ? [['leftFront', 0], ['rightFront', 0.3], ['leftHind', Math.PI], ['rightHind', Math.PI + 0.3]]
    : [['leftFront', 0], ['rightHind', 0], ['rightFront', Math.PI], ['leftHind', Math.PI]];
  for (const [leg, offset] of legs) {
    const s = Math.sin(p + offset);
    const c = Math.cos(p + offset);
    const hind = leg.endsWith('Hind');
    b.swing(`${leg}UpperLeg`, 'forward', (run ? 35 : 22) * amp * s);
    b.swing(`${leg}LowerLeg`, hind ? 'forward' : 'back', (run ? 45 : 28) * amp * Math.max(0, c));
  }
  b.turn('spine', 'left', (run ? 8 : 2) * amp * Math.sin(2 * p)).turn('hips', 'up', 3 * amp * Math.sin(p));
  b.move('hips', 0, (run ? 0.08 : 0.02) * amp * Math.cos(2 * p));
  b.turn('head', 'left', 4 * amp * Math.sin(2 * p + 1));
  b.turn('tail1', 'up', 10 * amp * Math.sin(p)).turn('tail2', 'up', 8 * amp * Math.sin(p - 0.6));
}

// --- vehicles --------------------------------------------------------------------------------

const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];

/** Roll every wheel by the distance travelled. */
function rollWheels(b: PoseBuilder, distance: number): void {
  for (const w of WHEELS) if (b.has(w)) b.turn(w, 'left', (distance / b.wheelRadius(w)) / DEG);
}

/** Whole turns per loop so a looping drive joins up seamlessly. */
function loopingDistance(b: PoseBuilder, speed: number, duration: number, u: number): number {
  const r = b.wheelRadius(WHEELS.find((w) => b.has(w)) ?? 'wheel_FL');
  const turns = Math.max(1, Math.round((speed * duration) / (TAU * r)));
  return turns * TAU * r * u;
}

function makeVehicle(duration: number, inPlace: boolean): Record<string, (b: PoseBuilder, u: number, amp: number) => void> {
  const steer = (b: PoseBuilder, sign: number, e: number, amp: number): void => {
    b.turn('suspension_FL', 'up', sign * 28 * amp * e).turn('suspension_FR', 'up', sign * 28 * amp * e);
    b.turn('steering', 'self', -sign * 120 * amp * e);
    b.turn('body', 'forward', sign * 3 * amp * e);
  };
  return {
    idle(b, u, amp) {
      b.move('body', 0, 0.004 * amp * Math.sin(TAU * 11 * u));
      b.turn('body', 'forward', 0.3 * amp * Math.sin(TAU * 5 * u));
    },
    drive(b, u, amp) {
      const d = loopingDistance(b, 8 * amp, duration, u);
      rollWheels(b, d);
      b.turn('body', 'left', -0.8 * amp);
      for (const [i, corner] of ['FL', 'FR', 'RL', 'RR'].entries()) b.move(`suspension_${corner}`, 0, 0.01 * amp * Math.sin(TAU * 3 * u + i));
      if (!inPlace) b.move('root', d / b.legLength, 0);
    },
    turnLeft(b, u, amp) {
      const e = bump(u, 0, 1);
      steer(b, 1, e, amp);
      rollWheels(b, 6 * duration * u);
      if (!inPlace) b.turn('root', 'up', 50 * amp * ramp(u, 0, 1)).move('root', (6 * duration * u) / b.legLength, 0);
    },
    turnRight(b, u, amp) {
      const e = bump(u, 0, 1);
      steer(b, -1, e, amp);
      rollWheels(b, 6 * duration * u);
      if (!inPlace) b.turn('root', 'up', -50 * amp * ramp(u, 0, 1)).move('root', (6 * duration * u) / b.legLength, 0);
    },
    brake(b, u, amp) {
      const v0 = 8;
      const stop = 0.6;
      const t = Math.min(u, stop) * duration;
      const d = v0 * (t - (t * t) / (2 * stop * duration));
      rollWheels(b, d);
      const dive = u < stop ? ramp(u, 0, stop) : Math.exp(-6 * (u - stop)) * Math.cos(TAU * 2 * (u - stop));
      b.turn('body', 'left', 4 * amp * dive);
      b.move('suspension_FL', 0, -0.03 * amp * Math.max(0, dive)).move('suspension_FR', 0, -0.03 * amp * Math.max(0, dive));
      if (!inPlace) b.move('root', d / b.legLength, 0);
    },
    suspensionBounce(b, u, amp) {
      const y = Math.exp(-3 * u) * Math.cos(TAU * 3 * u) * (1 - ramp(u, 0.9, 1));
      b.move('body', 0, 0.06 * amp * y);
      b.turn('body', 'left', 1.5 * amp * Math.exp(-3 * u) * Math.sin(TAU * 3 * u));
    },
  };
}

// --- keys, sampling and baking -------------------------------------------------------------

function keyValue(keys: readonly ModelClipKey[], time: number): { rotation: Quat; translation: Vec3 } {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  const rot = (k: ModelClipKey): Quat => (k.rotation ? qFromEulerDeg(k.rotation) : qIdentity());
  const tr = (k: ModelClipKey): Vec3 => k.translation ?? [0, 0, 0];
  if (time <= sorted[0]!.time) return { rotation: rot(sorted[0]!), translation: tr(sorted[0]!) };
  const last = sorted[sorted.length - 1]!;
  if (time >= last.time) return { rotation: rot(last), translation: tr(last) };
  const next = sorted.findIndex((k) => k.time > time);
  const a = sorted[next - 1]!;
  const b = sorted[next]!;
  const t = (time - a.time) / Math.max(1e-9, b.time - a.time);
  return { rotation: qSlerp(rot(a), rot(b), t), translation: v3.lerp(tr(a), tr(b), t) };
}

/** The pose of `rig` at `time` seconds into `clip` (wrapped when it loops, held at the end otherwise). */
export function samplePose(rig: ResolvedRig, clip: ModelClip, time: number): Pose {
  const { duration, loop } = clipTiming(clip);
  const t = loop ? ((time % duration) + duration) % duration : Math.min(Math.max(0, time), duration);
  const u = duration > 0 ? t / duration : 0;
  const amp = clip.intensity ?? 1;
  const inPlace = clip.inPlace ?? true;
  const builder = new PoseBuilder(rig);
  const table =
    rig.anatomy === 'biped'
      ? BIPED
      : rig.anatomy === 'quadruped'
        ? QUADRUPED
        : rig.anatomy === 'vehicle'
          ? makeVehicle(duration, inPlace)
          : {};
  const motion = table[clip.kind] as ((b: PoseBuilder, u: number, amp: number, inPlace?: boolean) => void) | undefined;
  motion?.(builder, u, amp, inPlace);
  // Additive keys, in the clip's own (unscaled) time.
  const keyTime = t * (clip.speed ?? 1);
  const byBone = new Map<string, ModelClipKey[]>();
  for (const key of clip.keys ?? []) byBone.set(key.bone, [...(byBone.get(key.bone) ?? []), key]);
  for (const [name, keys] of byBone) {
    const i = rig.byName.get(name);
    if (i === undefined) continue;
    const k = keyValue(keys, keyTime);
    const p = builder.pose[i]!;
    p.rotation = qNormalize(qMul(k.rotation, p.rotation));
    p.translation = v3.add(p.translation, k.translation);
  }
  return builder.pose;
}

export const CLIP_BAKE_FPS = 30;

export type BakedClip = {
  name: string;
  duration: number;
  loop: boolean;
  times: number[];
  /** Per bone: one local rotation per sample, sign-continuous so interpolation never flips the long way. */
  rotations: Quat[][];
  /** Per bone: one translation offset per sample (zeros when the bone never moves). */
  translations: Vec3[][];
};

export function bakeClip(rig: ResolvedRig, clip: ModelClip, fps = CLIP_BAKE_FPS): BakedClip {
  const { duration, loop } = clipTiming(clip);
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, i) => Math.round(((duration * i) / (frames - 1)) * 1e5) / 1e5);
  const rotations: Quat[][] = rig.bones.map(() => []);
  const translations: Vec3[][] = rig.bones.map(() => []);
  for (const time of times) {
    // A looping clip's last frame is its first again; sample just inside the end otherwise.
    const pose = samplePose(rig, clip, loop && time >= duration ? 0 : time);
    pose.forEach((bp, i) => {
      const prev = rotations[i]![rotations[i]!.length - 1];
      let q = bp.rotation;
      if (prev && prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
      rotations[i]!.push(q);
      translations[i]!.push(bp.translation);
    });
  }
  return { name: clip.name, duration, loop, times, rotations, translations };
}

/**
 * Copies clips onto another rig: bone names in keys are mapped to the target's table (aliases
 * included), keys on bones it lacks are dropped, and translations are scaled by the leg-length ratio.
 * Generated motion needs no mapping — it is regenerated from the target's own proportions.
 */
export function retargetClips(from: ResolvedRig, to: ResolvedRig, clips: readonly ModelClip[]): ModelClip[] {
  const legOf = (rig: ResolvedRig): number => new PoseBuilder(rig).legLength;
  const scale = legOf(to) / legOf(from);
  return clips
    .filter((clip) => clip.kind === 'custom' || from.anatomy === to.anatomy)
    .map((clip) => {
      const keys = (clip.keys ?? []).flatMap((key) => {
        const name = canonicalBoneName(to.anatomy, key.bone);
        if (!name || !to.byName.has(name)) return [];
        return [{ ...key, bone: name, ...(key.translation ? { translation: v3.scale(key.translation, scale) as Vec3 } : {}) }];
      });
      return { ...clip, ...(clip.keys ? { keys } : {}) };
    });
}

/** Every bone name the anatomy's table allows — re-exported for tools that list them. */
export const boneNamesFor = (anatomy: ResolvedRig['anatomy']): string[] => MODEL_BONE_TABLE[anatomy].map((b) => b.name);
