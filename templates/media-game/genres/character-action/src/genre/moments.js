// @ts-check
/**
 * The character-action game-feel table: flashy and rhythmic. Every move in a string gets a
 * slash arc and a rising whoosh, a launcher pops the target with a white frame, juggle hits
 * keep a small hit-stop going, and the style meter announces each rank. Pure data and maths
 * (no imports), checked against the kit's sfx names and particle presets by a unit test.
 * Played by `fx.moment(name, ...)` (`./fx.js`).
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
  slash: { sfx: [{ name: 'swing', pitch: 1, power: 0.75 }] },
  'slash-heavy': { shake: 0.08, sfx: [{ name: 'swing', pitch: 0.65, power: 1 }] },
  dash: { particles: [{ kind: 'dust', count: 6, scale: 0.8 }], sfx: [{ name: 'swing', pitch: 1.6, power: 0.55 }] },
  'hit-light': { shake: 0.12, hitStop: 45, glow: 0xffffff, particles: [{ kind: 'spark', count: 8, colors: [0xffffff, 0xffe27a, 0xff9a5c] }], sfx: [{ name: 'hit', pitch: 1.15, power: 0.85 }] },
  'hit-heavy': {
    shake: 0.35,
    hitStop: 95,
    aberration: 0.5,
    glow: 0xffd37a,
    textKind: 'crit',
    particles: [{ kind: 'spark', count: 14, scale: 1.2 }, { kind: 'impact', count: 8 }],
    sfx: [{ name: 'hit', pitch: 0.7, power: 1.1 }, { name: 'land', pitch: 1.1, power: 0.4 }],
  },
  launcher: {
    shake: 0.5,
    hitStop: 110,
    slowMo: [0.5, 0.18],
    flash: 0.4,
    flashSeconds: 0.09,
    aberration: 0.9,
    glow: 0xffffff,
    particles: [{ kind: 'impact', count: 14, scale: 1.3 }, { kind: 'dust', count: 8, scale: 1.2 }],
    sfx: [{ name: 'hit', pitch: 0.6, power: 1.1 }, { name: 'jump', pitch: 0.8, power: 0.5 }],
  },
  // Each hit on an airborne enemy: a short freeze that keeps the juggle's rhythm.
  juggle: { shake: 0.1, hitStop: 40, glow: 0xaee0ff, particles: [{ kind: 'spark', count: 7, colors: [0xaee0ff, 0xffffff, 0x7cc4ff] }], sfx: [{ name: 'hit', pitch: 1.4, power: 0.7 }] },
  slam: {
    shake: 0.7,
    hitStop: 120,
    flash: 0.3,
    flashSeconds: 0.12,
    aberration: 0.8,
    particles: [{ kind: 'debris', count: 14, scale: 1.3 }, { kind: 'dust', count: 12, scale: 1.6 }],
    sfx: [{ name: 'explosion', pitch: 2, power: 0.5 }, { name: 'land', pitch: 0.55, power: 1 }],
  },
  'enemy-death': { shake: 0.25, hitStop: 70, particles: [{ kind: 'debris', count: 10 }, { kind: 'spark', count: 10 }], sfx: [{ name: 'death', pitch: 1.2, power: 0.7 }] },
  'player-hurt': { shake: 0.45, hitStop: 70, flash: 0.3, flashColor: 0xff3b3b, aberration: 1, squash: [1.2, 0.8], sfx: [{ name: 'hurt', pitch: 1, power: 0.9 }] },
  'style-up': { flash: 0.1, flashColor: 0xffe08a, sfx: [{ name: 'powerup', pitch: 1, power: 0.35 }] },
  'style-top': { shake: 0.2, flash: 0.25, flashColor: 0xffe08a, flashSeconds: 0.3, aberration: 0.5, particles: [{ kind: 'spark', count: 20, scale: 1.4, colors: [0xffe08a, 0xffffff, 0xff9a3c] }], sfx: [{ name: 'powerup', pitch: 1.3, power: 0.5 }, { name: 'win', pitch: 1.2, power: 0.4 }] },
  'style-down': { sfx: [{ name: 'hurt', pitch: 0.5, power: 0.25 }] },
  'wave-start': { shake: 0.2, flash: 0.1, flashColor: 0xff7a5c, sfx: [{ name: 'door', pitch: 0.6, power: 0.8 }, { name: 'powerup', pitch: 0.7, power: 0.3 }] },
  'arena-seal': { shake: 0.35, particles: [{ kind: 'dust', count: 14, scale: 1.8 }], sfx: [{ name: 'door', pitch: 0.5, power: 1 }, { name: 'land', pitch: 0.6, power: 0.8 }] },
  'arena-clear': { flash: 0.3, flashColor: 0xffe08a, flashSeconds: 0.5, slowMo: [0.4, 0.5], particles: [{ kind: 'spark', count: 24, scale: 1.5, colors: [0xffe08a, 0xffffff, 0xff9a3c] }], sfx: [{ name: 'win', pitch: 1, power: 0.8 }] },
  defeated: { shake: 0.6, hitStop: 100, slowMo: [0.3, 0.6], flash: 0.5, flashColor: 0x700000, flashSeconds: 0.5, aberration: 1, sfx: [{ name: 'death', pitch: 0.8, power: 1 }] },
};

/**
 * The slash arc each move draws. `tilt` rolls the arc's plane (0 = flat across the front, 1.2 =
 * a rising upward cut); `sweep` is the angle it crosses, `scale` its reach, `flip` alternates
 * the direction of the light string so it reads as left-right-left.
 * @type {Record<string, { tilt: number, sweep: number, scale: number, color: number, seconds: number, flip: number }>}
 */
export const ARCS = {
  'slash-1': { tilt: 0.15, sweep: 1.7, scale: 1, color: 0xffd9a0, seconds: 0.18, flip: 1 },
  'slash-2': { tilt: -0.15, sweep: 1.7, scale: 1, color: 0xffd9a0, seconds: 0.18, flip: -1 },
  'slash-3': { tilt: 0.3, sweep: 2.1, scale: 1.15, color: 0xffc27a, seconds: 0.2, flip: 1 },
  finisher: { tilt: 0.1, sweep: 2.8, scale: 1.4, color: 0xff9a5c, seconds: 0.3, flip: -1 },
  cleave: { tilt: 1.25, sweep: 2, scale: 1.25, color: 0xffb06b, seconds: 0.26, flip: 1 },
  launcher: { tilt: 1.0, sweep: 2.2, scale: 1.3, color: 0xaee0ff, seconds: 0.24, flip: -1 },
  'air-1': { tilt: -0.4, sweep: 1.8, scale: 1, color: 0xaee0ff, seconds: 0.18, flip: 1 },
  'air-2': { tilt: 0.4, sweep: 1.8, scale: 1, color: 0xaee0ff, seconds: 0.18, flip: -1 },
  'air-3': { tilt: -0.2, sweep: 2.2, scale: 1.15, color: 0xaee0ff, seconds: 0.2, flip: 1 },
  slam: { tilt: 1.45, sweep: 2.4, scale: 1.4, color: 0xff8a5c, seconds: 0.28, flip: 1 },
};

/**
 * Which moment a connecting move plays: launchers, slams, heavy blows (20+ damage) and juggle
 * hits each have their own; anything else is a light hit.
 * @param {{ name: string, damage: number, launcher?: boolean }} move
 * @param {boolean} targetAirborne
 * @returns {'launcher' | 'slam' | 'hit-heavy' | 'juggle' | 'hit-light'}
 */
export function hitMoment(move, targetAirborne) {
  if (move.launcher) return 'launcher';
  if (move.name === 'slam') return 'slam';
  if (move.damage >= 20) return 'hit-heavy';
  return targetAirborne ? 'juggle' : 'hit-light';
}

/**
 * The announcement for a new style rank: the letter, a colour, a size and a pitch for the sound.
 * Higher ranks are bigger and warmer; `top` marks the three highest.
 * @param {number} index rank index, 0 (D) to 6 (SSS)
 * @param {string} letter
 */
export function rankCall(index, letter) {
  const colors = ['#9aa4b2', '#7cc4ff', '#7fe0a0', '#ffd24d', '#ff9a3c', '#ff6b4d', '#ff3b6b'];
  return { text: letter, color: colors[Math.min(index, colors.length - 1)] ?? '#ffffff', size: 40 + index * 9, pitch: 0.85 + index * 0.08, top: index >= 4 };
}

/** Whether to leave an afterimage this step: running or lunging fast, every third step. @param {number} speed @param {number} step */
export const wantsGhost = (speed, step) => speed > 5.2 && step % 3 === 0;

/** The opacity of a ghost `age` seconds old that lives `life` seconds. @param {number} age @param {number} life */
export const ghostAlpha = (age, life) => (age >= life ? 0 : 0.45 * (1 - age / life) ** 1.5);
