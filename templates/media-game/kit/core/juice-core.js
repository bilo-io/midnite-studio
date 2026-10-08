// @ts-check
/**
 * Midnite game kit — the engine-free half of "juice" (game feel).
 *
 * Pure data and maths shared by `kit/three/juice.js` and `kit/phaser/juice.js`:
 * the trauma shake model, hit-stop / slow-motion time scale, particle presets
 * and spawning, and the `TRIGGERS` table that says what a named moment
 * (`jump`, `land`, `hit`, ...) does. Everything advances by the caller's `dt`
 * and draws from a seeded generator, so a play-test replays it exactly.
 */

import { easeOf } from './tween.js';

/**
 * Camera shake by trauma (Squirrel Eiserloh's model): trauma in [0, 1] decays
 * linearly; the shake amount is trauma squared, so small hits are subtle and
 * stacked hits ramp up hard. Offsets come from smooth noise of the shake's own clock.
 * @param {{ decay?: number }} [o] trauma lost per second
 */
export function createTrauma(o = {}) {
  const decay = o.decay ?? 1.4;
  let trauma = 0;
  let clock = 0;
  // A smooth pseudo-noise: sums of incommensurate sines per channel.
  const noise = (/** @type {number} */ t, /** @type {number} */ k) =>
    (Math.sin(t * 19.1 + k * 12.9898) + Math.sin(t * 31.7 + k * 78.233) * 0.6 + Math.sin(t * 47.3 + k * 37.719) * 0.4) / 2;
  return {
    get trauma() {
      return trauma;
    },
    /** Add trauma (clamped to 1). @param {number} amount */
    add(amount) {
      trauma = Math.min(1, trauma + Math.max(0, amount));
    },
    reset() {
      trauma = 0;
    },
    /** @param {number} dt */
    update(dt) {
      clock += dt;
      trauma = Math.max(0, trauma - decay * dt);
    },
    /**
     * Current offsets, each in [-1, 1] times the squared trauma: scale them by your max
     * translation and rotation.
     * @returns {{ x: number, y: number, roll: number, amount: number }}
     */
    sample() {
      const amount = trauma * trauma;
      return { x: noise(clock, 1) * amount, y: noise(clock, 2) * amount, roll: noise(clock, 3) * amount, amount };
    },
  };
}

/**
 * Hit-stop and slow motion. `scale(dt)` returns the dt the simulation should use
 * (0 during a hit-stop). The stop's own duration counts real (unscaled) dt.
 */
export function createTimeScale() {
  let stopLeft = 0;
  let slowLeft = 0;
  let slowScale = 1;
  return {
    get frozen() {
      return stopLeft > 0;
    },
    get value() {
      return stopLeft > 0 ? 0 : slowLeft > 0 ? slowScale : 1;
    },
    /** Freeze the simulation for `ms`; overlapping stops keep the longer. @param {number} ms */
    hitStop(ms) {
      stopLeft = Math.max(stopLeft, ms / 1000);
    },
    /** Run at `scale` of normal speed for `seconds` of real time. @param {number} scale @param {number} seconds */
    slowMo(scale, seconds) {
      slowScale = scale;
      slowLeft = Math.max(slowLeft, seconds);
    },
    /** @param {number} dt real seconds @returns {number} the dt to simulate */
    scale(dt) {
      const scaled = this.value * dt;
      stopLeft = Math.max(0, stopLeft - dt);
      slowLeft = Math.max(0, slowLeft - dt);
      return scaled;
    },
    reset() {
      stopLeft = slowLeft = 0;
    },
  };
}

/** An envelope that decays from 1 to 0 over `duration`: the hit-flash intensity. @param {number} age @param {number} duration @param {string} [ease] */
export const flashLevel = (age, duration, ease = 'outQuad') => (age >= duration ? 0 : 1 - easeOf(ease)(age / duration));

/**
 * @typedef {{
 *   count: [number, number], speed: [number, number], life: [number, number], size: [number, number],
 *   gravity: number, drag: number, spread: number, colors: number[], blend: 'add' | 'normal', soft: number,
 *   up?: number, bounce?: number,
 * }} ParticlePreset
 * `spread` is the cone half-angle in radians around the direction (PI = a sphere); `up` biases
 * velocity upward; `soft` is 1 for round glows, 0 for hard-edged chips.
 */

/** @type {Record<string, ParticlePreset>} */
export const PARTICLE_PRESETS = {
  spark: { count: [8, 14], speed: [3, 7], life: [0.25, 0.55], size: [0.09, 0.18], gravity: 9, drag: 1.2, spread: 1.1, colors: [0xffe9a8, 0xffb347, 0xff7a3d], blend: 'add', soft: 1, bounce: 0.3 },
  dust: { count: [6, 10], speed: [0.6, 1.8], life: [0.4, 0.8], size: [0.25, 0.5], gravity: -0.4, drag: 2.5, spread: 1.5, colors: [0xb8aa94, 0x9a8f7d, 0xcfc4b0], blend: 'normal', soft: 1, up: 0.35 },
  debris: { count: [6, 12], speed: [2, 5.5], life: [0.6, 1.1], size: [0.07, 0.15], gravity: 14, drag: 0.4, spread: 1.3, colors: [0x6b7280, 0x4b5563, 0x8a5a30, 0x9ca3af], blend: 'normal', soft: 0, up: 0.5, bounce: 0.4 },
  muzzle: { count: [5, 8], speed: [2, 6], life: [0.06, 0.14], size: [0.12, 0.3], gravity: 0, drag: 6, spread: 0.45, colors: [0xfff2c2, 0xffc766, 0xff9a3c], blend: 'add', soft: 1 },
  impact: { count: [10, 16], speed: [2, 6], life: [0.15, 0.4], size: [0.14, 0.34], gravity: 2, drag: 3, spread: 1.4, colors: [0xffffff, 0xffe27a, 0xff8f6b], blend: 'add', soft: 1 },
};

/**
 * Descriptors for one burst, in world units: a unit `dir` and a `scale` (intensity, 0 spawns nothing).
 * The caller integrates `pos += vel * dt; vel.y -= gravity * dt; vel *= 1 - drag * dt`.
 * @param {string} kind a `PARTICLE_PRESETS` key
 * @param {{ next(): number, range(a: number, b: number): number, pick<T>(items: readonly T[]): T }} rng
 * @param {{ dir?: readonly number[], scale?: number, count?: number, colors?: number[] }} [o]
 * @returns {{ vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity: number, drag: number, blend: 'add' | 'normal', soft: number, bounce: number }[]}
 */
export function spawnParticles(kind, rng, o = {}) {
  const p = PARTICLE_PRESETS[kind];
  if (!p) throw new Error(`unknown particle preset: ${kind}`);
  const scale = o.scale ?? 1;
  if (scale <= 0) return [];
  const [dx, dy, dz] = o.dir ?? [0, 1, 0];
  const len = Math.hypot(dx ?? 0, dy ?? 1, dz ?? 0) || 1;
  const d = [(dx ?? 0) / len, (dy ?? 1) / len, (dz ?? 0) / len];
  const n = Math.max(1, Math.round((o.count ?? rng.range(p.count[0], p.count[1] + 1)) * Math.min(1.5, scale)));
  const palette = o.colors ?? p.colors;
  /** @type {ReturnType<typeof spawnParticles>} */
  const out = [];
  for (let i = 0; i < n; i += 1) {
    // A random direction inside the cone: perturb `d` by up to `spread` radians.
    const a = rng.range(-1, 1) * p.spread;
    const b = rng.range(-1, 1) * p.spread;
    let vx = d[0] + Math.sin(a);
    let vy = d[1] + Math.sin(b) + (p.up ?? 0);
    let vz = d[2] + Math.sin(rng.range(-1, 1) * p.spread);
    const l = Math.hypot(vx, vy, vz) || 1;
    const speed = rng.range(p.speed[0], p.speed[1]) * (0.6 + 0.4 * Math.min(1.5, scale));
    vx = (vx / l) * speed;
    vy = (vy / l) * speed;
    vz = (vz / l) * speed;
    out.push({ vx, vy, vz, life: rng.range(p.life[0], p.life[1]), size: rng.range(p.size[0], p.size[1]), color: rng.pick(palette), gravity: p.gravity, drag: p.drag, blend: p.blend, soft: p.soft, bounce: p.bounce ?? 0 });
  }
  return out;
}

/**
 * What a named game moment does. Engines read the same row: `shake` is trauma to add,
 * `hitStop` ms of freeze, `flash` a screen flash alpha (0 = none), `aberration` a chromatic
 * pulse, `squash` a `[x, y]` scale pulse for the actor, `particles` a preset (+ `count`),
 * `sfx` a `kit/core/sfx.js` preset, `text` floating text colour kind.
 * @typedef {{ shake?: number, hitStop?: number, flash?: number, aberration?: number, squash?: [number, number], particles?: string, count?: number, sfx?: string, flashColor?: number }} Trigger
 * @type {Record<string, Trigger>}
 */
export const TRIGGERS = {
  jump: { squash: [0.82, 1.22], particles: 'dust', count: 5, sfx: 'jump' },
  land: { shake: 0.12, squash: [1.25, 0.78], particles: 'dust', count: 8, sfx: 'land' },
  footstep: { sfx: 'footstep' },
  hit: { shake: 0.35, hitStop: 55, flash: 0.25, aberration: 0.6, squash: [1.15, 0.88], particles: 'impact', sfx: 'hit' },
  hurt: { shake: 0.55, hitStop: 80, flash: 0.35, aberration: 1, flashColor: 0xff3b3b, squash: [1.2, 0.8], particles: 'spark', sfx: 'hurt' },
  pickup: { flash: 0.1, squash: [1.2, 1.2], particles: 'spark', count: 8, sfx: 'pickup', flashColor: 0xfff2b0 },
  shoot: { shake: 0.08, particles: 'muzzle', sfx: 'shoot' },
  explosion: { shake: 0.9, hitStop: 70, flash: 0.5, aberration: 1, particles: 'debris', count: 14, sfx: 'explosion', flashColor: 0xffd28a },
  death: { shake: 0.7, hitStop: 120, flash: 0.4, aberration: 1, particles: 'debris', sfx: 'death', flashColor: 0xff5050 },
  win: { flash: 0.25, particles: 'spark', count: 16, sfx: 'win', flashColor: 0xfff2b0 },
};
