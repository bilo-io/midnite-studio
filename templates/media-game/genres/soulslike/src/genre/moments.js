// @ts-check
/**
 * The soulslike's game-feel table: heavy and unhurried, so hits freeze a little longer and
 * the sounds sit low. Pure data and maths (no imports), checked against the kit's sfx names
 * and particle presets by a unit test. Played by `fx.moment(name, ...)` (`./fx.js`); the
 * field meanings are documented in the shooter's table and in `fx.js`.
 *
 * @typedef {{ name: string, pitch?: number, power?: number }} SfxCue
 * @typedef {{ kind: string, count?: number, scale?: number, colors?: number[] }} Burst
 * @typedef {{
 *   shake?: number, hitStop?: number, slowMo?: [number, number], flash?: number, flashColor?: number, flashSeconds?: number,
 *   aberration?: number, squash?: [number, number], glow?: number, particles?: Burst[], sfx?: SfxCue[], textKind?: 'hit' | 'crit' | 'heal',
 * }} Moment
 * @type {Record<string, Moment>}
 */
export const MOMENTS = {
  'swing-light': { sfx: [{ name: 'swing', pitch: 1, power: 0.8 }] },
  'swing-heavy': { shake: 0.06, sfx: [{ name: 'swing', pitch: 0.6, power: 1.1 }] },
  'hit-light': {
    shake: 0.14,
    hitStop: 55,
    glow: 0xffffff,
    squash: [1.12, 0.9],
    particles: [{ kind: 'spark', count: 8 }, { kind: 'dust', count: 3, scale: 0.6 }],
    sfx: [{ name: 'hit', pitch: 0.85, power: 0.9 }],
  },
  'hit-heavy': {
    shake: 0.4,
    hitStop: 110,
    aberration: 0.5,
    flash: 0.12,
    glow: 0xffd9a0,
    squash: [1.2, 0.8],
    textKind: 'crit',
    particles: [{ kind: 'spark', count: 14, scale: 1.2 }, { kind: 'debris', count: 6 }, { kind: 'dust', count: 6 }],
    sfx: [{ name: 'hit', pitch: 0.6, power: 1.1 }, { name: 'land', pitch: 0.8, power: 0.6 }],
  },
  stagger: { shake: 0.25, squash: [1.18, 0.82], sfx: [{ name: 'block', pitch: 0.55, power: 0.7 }, { name: 'hurt', pitch: 0.7, power: 0.4 }] },
  roll: { squash: [1.15, 0.7], particles: [{ kind: 'dust', count: 7 }], sfx: [{ name: 'swing', pitch: 0.5, power: 0.9 }, { name: 'footstep', pitch: 0.7, power: 0.7 }] },
  'roll-end': { particles: [{ kind: 'dust', count: 4, scale: 0.7 }], sfx: [{ name: 'land', pitch: 1.3, power: 0.45 }] },
  parry: {
    shake: 0.3,
    hitStop: 70,
    slowMo: [0.35, 0.22],
    flash: 0.5,
    flashColor: 0xcfe6ff,
    flashSeconds: 0.22,
    aberration: 0.8,
    particles: [{ kind: 'spark', count: 18, scale: 1.3, colors: [0xffffff, 0xcfe6ff, 0x8fc2ff] }, { kind: 'impact', count: 8, colors: [0xffffff, 0xcfe6ff] }],
    sfx: [{ name: 'parry', pitch: 0.85, power: 1 }, { name: 'block', pitch: 1.2, power: 0.5 }],
  },
  'player-hit': { shake: 0.4, hitStop: 80, flash: 0.28, flashColor: 0x8a0f0f, aberration: 0.9, squash: [1.2, 0.8], particles: [{ kind: 'spark', count: 8, colors: [0xff4d4d, 0x8a0f0f] }], sfx: [{ name: 'hurt', pitch: 0.85, power: 1 }] },
  'player-hit-heavy': {
    shake: 0.7,
    hitStop: 130,
    slowMo: [0.5, 0.18],
    flash: 0.4,
    flashColor: 0x8a0f0f,
    aberration: 1,
    squash: [1.3, 0.7],
    particles: [{ kind: 'spark', count: 14, colors: [0xff4d4d, 0x8a0f0f] }, { kind: 'debris', count: 6 }],
    sfx: [{ name: 'hurt', pitch: 0.65, power: 1.1 }, { name: 'land', pitch: 0.7, power: 0.7 }],
  },
  'you-died': { shake: 0.6, hitStop: 150, slowMo: [0.25, 1.1], aberration: 1, sfx: [{ name: 'death', pitch: 0.55, power: 1 }, { name: 'explosion', pitch: 0.4, power: 0.35 }] },
  'enemy-death': { shake: 0.3, hitStop: 90, flash: 0.1, flashColor: 0xffd9a0, particles: [{ kind: 'debris', count: 10 }, { kind: 'spark', count: 10, colors: [0xffd9a0, 0xffb347, 0xffffff] }], sfx: [{ name: 'death', pitch: 1.1, power: 0.7 }] },
  'boss-felled': {
    shake: 0.8,
    hitStop: 200,
    slowMo: [0.2, 1.8],
    flash: 0.6,
    flashColor: 0xffe2a0,
    flashSeconds: 0.8,
    aberration: 1,
    particles: [{ kind: 'spark', count: 30, scale: 1.6, colors: [0xffe2a0, 0xffb347, 0xffffff] }, { kind: 'debris', count: 14, scale: 1.4 }],
    sfx: [{ name: 'explosion', pitch: 0.6, power: 1 }, { name: 'win', pitch: 0.55, power: 0.6 }],
  },
  'boss-roar': { shake: 0.75, hitStop: 90, slowMo: [0.5, 0.4], flash: 0.2, flashColor: 0xff3b2e, aberration: 1, sfx: [{ name: 'explosion', pitch: 0.45, power: 0.7 }, { name: 'hurt', pitch: 0.4, power: 0.8 }] },
  'boss-windup': { sfx: [{ name: 'swing', pitch: 0.4, power: 0.9 }] },
  'boss-slam': { shake: 0.55, particles: [{ kind: 'debris', count: 12, scale: 1.2 }, { kind: 'dust', count: 10, scale: 1.6 }], sfx: [{ name: 'explosion', pitch: 1.6, power: 0.6 }, { name: 'land', pitch: 0.5, power: 0.9 }] },
  'hollow-windup': { sfx: [{ name: 'swing', pitch: 0.8, power: 0.55 }] },
  'bonfire-rest': {
    shake: 0.06,
    flash: 0.3,
    flashColor: 0xffb366,
    flashSeconds: 0.9,
    particles: [{ kind: 'spark', count: 24, scale: 1.2, colors: [0xffd9a0, 0xff9a3c, 0xffe9a8] }],
    sfx: [{ name: 'powerup', pitch: 0.5, power: 0.55 }, { name: 'win', pitch: 0.5, power: 0.3 }],
  },
  'stamina-out': { sfx: [{ name: 'hurt', pitch: 0.55, power: 0.35 }, { name: 'footstep', pitch: 0.5, power: 0.4 }] },
  'stamina-denied': { sfx: [{ name: 'ui-click', pitch: 0.45, power: 0.6 }] },
  'lock-on': { sfx: [{ name: 'ui-click', pitch: 1.5, power: 0.6 }, { name: 'ui-hover', pitch: 0.9, power: 0.8 }] },
  'lock-off': { sfx: [{ name: 'ui-click', pitch: 0.8, power: 0.5 }] },
};

/**
 * A flame's flicker, 0..1 around 0.5, from three incommensurate sines of `t` (seconds of
 * game time). Drives the bonfire light and flames, so it replays exactly.
 * @param {number} t
 * @param {number} [seed]
 */
export const flicker = (t, seed = 0) => 0.5 + (Math.sin(t * 9.1 + seed) * 0.5 + Math.sin(t * 15.7 + seed * 2.3) * 0.3 + Math.sin(t * 27.3 + seed * 0.7) * 0.2) * 0.5;

/**
 * The curtain's opacity over time for `{ in, hold, out }` seconds, 0..1 (eased in, flat, eased out).
 * @param {number} t seconds since the curtain started
 * @param {{ in: number, hold: number, out: number }} plan
 */
export function curtainLevel(t, plan) {
  if (t <= 0) return 0;
  if (t < plan.in) return 1 - (1 - t / plan.in) ** 2;
  if (t < plan.in + plan.hold) return 1;
  const k = (t - plan.in - plan.hold) / Math.max(1e-6, plan.out);
  return k >= 1 ? 0 : 1 - k * k;
}

/** Lean (radians) of the body through a roll: a forward tuck that peaks mid-roll. @param {number} t seconds into the roll @param {number} seconds the roll's length */
export const rollLean = (t, seconds) => -Math.sin(Math.PI * Math.min(1, Math.max(0, t / seconds))) * 1.05;
