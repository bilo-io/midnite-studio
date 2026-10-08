// @ts-check
/**
 * The fighter's game-feel table. Fights are frame-counted, so everything here is about
 * impact: hit-stop that grows with the blow, a white impact frame on launchers, a guard spark
 * that is a different colour from a hit spark, a combo counter that pops harder as it climbs,
 * and a slow-motion KO. Pure data and maths (no imports), checked against the kit's sfx names
 * and particle presets by a unit test. Played by `fx.moment(name, ...)` (`./fx.js`).
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
  'swing-punch': { sfx: [{ name: 'swing', pitch: 1.25, power: 0.55 }] },
  'swing-kick': { sfx: [{ name: 'swing', pitch: 0.8, power: 0.8 }] },
  'hit-light': {
    shake: 0.16,
    hitStop: 50,
    particles: [{ kind: 'spark', count: 7 }],
    sfx: [{ name: 'hit', pitch: 1.2, power: 0.8 }],
  },
  'hit-heavy': {
    shake: 0.34,
    hitStop: 90,
    aberration: 0.5,
    particles: [{ kind: 'spark', count: 12, scale: 1.2 }, { kind: 'impact', count: 8 }],
    sfx: [{ name: 'hit', pitch: 0.8, power: 1 }, { name: 'land', pitch: 1.2, power: 0.4 }],
  },
  // The launcher is the fighter's "super": a white impact frame, a heavy freeze and a slow beat.
  launcher: {
    shake: 0.8,
    hitStop: 140,
    slowMo: [0.4, 0.28],
    flash: 0.55,
    flashColor: 0xffffff,
    flashSeconds: 0.09,
    aberration: 1,
    particles: [{ kind: 'impact', count: 16, scale: 1.4 }, { kind: 'spark', count: 14, scale: 1.3 }, { kind: 'dust', count: 6 }],
    sfx: [{ name: 'hit', pitch: 0.55, power: 1.2 }, { name: 'jump', pitch: 0.7, power: 0.5 }, { name: 'explosion', pitch: 2.2, power: 0.25 }],
  },
  guard: {
    shake: 0.07,
    hitStop: 30,
    particles: [{ kind: 'spark', count: 9, colors: [0xbfe3ff, 0x7cc4ff, 0xffffff] }],
    sfx: [{ name: 'block', pitch: 1, power: 0.9 }],
  },
  knockdown: { shake: 0.4, particles: [{ kind: 'dust', count: 12, scale: 1.4 }], sfx: [{ name: 'land', pitch: 0.75, power: 0.9 }] },
  footstep: { sfx: [{ name: 'footstep', pitch: 0.85, power: 0.35 }] },
  'combo-hit': { sfx: [{ name: 'coin', pitch: 1, power: 0.12 }] },
  'combo-milestone': { sfx: [{ name: 'powerup', pitch: 1, power: 0.3 }], flash: 0.1, flashColor: 0xffe08a },
  'round-start': { shake: 0.1, sfx: [{ name: 'door', pitch: 0.55, power: 0.8 }, { name: 'powerup', pitch: 0.6, power: 0.35 }] },
  fight: { flash: 0.18, flashColor: 0xffffff, sfx: [{ name: 'win', pitch: 1.1, power: 0.35 }, { name: 'ui-click', pitch: 0.7, power: 0.6 }] },
  ko: {
    shake: 0.95,
    hitStop: 200,
    slowMo: [0.2, 1.7],
    flash: 0.75,
    flashColor: 0xffffff,
    flashSeconds: 0.4,
    aberration: 1,
    particles: [{ kind: 'impact', count: 20, scale: 1.6 }, { kind: 'debris', count: 12, scale: 1.3 }],
    sfx: [{ name: 'death', pitch: 0.8, power: 1 }, { name: 'explosion', pitch: 1.1, power: 0.7 }, { name: 'hit', pitch: 0.45, power: 1 }],
  },
  'round-win': { flash: 0.2, flashColor: 0xffe08a, sfx: [{ name: 'win', pitch: 1, power: 0.6 }] },
  'match-win': { flash: 0.3, flashColor: 0xffe08a, flashSeconds: 0.6, particles: [{ kind: 'spark', count: 24, scale: 1.6, colors: [0xffe08a, 0xffffff, 0xff9a3c] }], sfx: [{ name: 'win', pitch: 0.9, power: 0.9 }, { name: 'powerup', pitch: 1.3, power: 0.4 }] },
  'match-lose': { flash: 0.3, flashColor: 0x400000, flashSeconds: 0.8, sfx: [{ name: 'death', pitch: 0.6, power: 0.8 }] },
  'time-over': { sfx: [{ name: 'ui-click', pitch: 0.55, power: 0.9 }, { name: 'door', pitch: 1.6, power: 0.4 }] },
};

/**
 * Which moment a landed blow plays: a launcher is the big one, a juggle or a high-damage finisher
 * is heavy, anything else is light. Pure, so a test can pin the thresholds.
 * @param {{ damage: number, launcher?: boolean, juggled?: boolean }} hit
 * @returns {'launcher' | 'hit-heavy' | 'hit-light'}
 */
export function classifyHit(hit) {
  if (hit.launcher) return 'launcher';
  if (hit.damage >= 14 || hit.juggled) return 'hit-heavy';
  return 'hit-light';
}

/**
 * The combo counter's look at `count` hits: the label, a colour and a size that grow with the
 * string, and whether this count is a milestone (every third hit from three).
 * @param {number} count
 */
export function comboTier(count) {
  const color = count >= 9 ? '#ff5a4d' : count >= 6 ? '#ff9a3c' : count >= 3 ? '#ffd24d' : '#ffffff';
  return { label: `${count} HIT${count === 1 ? '' : 'S'}`, color, size: Math.min(64, 26 + count * 4), milestone: count >= 3 && count % 3 === 0 };
}

/**
 * Where on the defender a blow lands (world y), by the move's level.
 * @param {string} level 'high' | 'mid' | 'low'
 * @param {boolean} crouching
 */
export const contactHeight = (level, crouching) => (level === 'low' ? 0.5 : level === 'high' ? (crouching ? 0.9 : 1.55) : crouching ? 0.8 : 1.2);

/**
 * The fixed 60 Hz steps to simulate this frame given the (hit-stop and slow-motion scaled) dt:
 * `accumulator + dt` in whole steps, the remainder carried. The fight is frame-counted, so slow
 * motion runs it at a fraction of the steps and a hit-stop at none.
 * @param {number} accumulator
 * @param {number} dt
 * @param {number} [step]
 * @returns {{ steps: number, accumulator: number }}
 */
export function simSteps(accumulator, dt, step = 1 / 60) {
  let acc = accumulator + dt;
  let steps = 0;
  while (acc >= step * 0.999 && steps < 4) {
    acc -= step;
    steps += 1;
  }
  return { steps, accumulator: Math.max(0, acc) };
}

/** A lantern's flicker, 0..1, from two incommensurate sines of game time. @param {number} t @param {number} [seed] */
export const flickerOf = (t, seed = 0) => 0.5 + (Math.sin(t * 8.3 + seed) * 0.6 + Math.sin(t * 19.1 + seed * 1.9) * 0.4) * 0.5;
