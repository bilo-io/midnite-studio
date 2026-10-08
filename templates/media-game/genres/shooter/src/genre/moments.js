// @ts-check
/**
 * The shooter's game-feel table. Pure data and maths (no imports), so a unit test can
 * check every row against the kit's sfx names and particle presets.
 *
 * Each row is played by `fx.moment(name, ...)` (`./fx.js`): `shake` is trauma, `hitStop`
 * milliseconds of freeze, `slowMo` is `[scale, real seconds]`, `flash` a screen flash,
 * `aberration` a chromatic pulse, `particles` kit presets, `sfx` kit presets with a pitch
 * and power so one synthesized sound can read as a rifle, a pistol or an enemy's gun.
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
  'fire-rifle': { shake: 0.07, particles: [{ kind: 'muzzle', count: 6 }], sfx: [{ name: 'gunshot-rifle', power: 0.85 }] },
  'fire-pistol': { shake: 0.11, particles: [{ kind: 'muzzle', count: 5, scale: 0.8 }], sfx: [{ name: 'gunshot-pistol', power: 0.8 }] },
  // No shotgun in the arsenal yet; a weapon table row for one fires this.
  'fire-shotgun': { shake: 0.3, aberration: 0.2, particles: [{ kind: 'muzzle', count: 10, scale: 1.2 }, { kind: 'dust', count: 4 }], sfx: [{ name: 'gunshot-shotgun', power: 0.95 }] },
  'fire-launcher': {
    shake: 0.4,
    aberration: 0.3,
    particles: [{ kind: 'muzzle', count: 12, scale: 1.4 }, { kind: 'dust', count: 6 }],
    sfx: [{ name: 'gunshot-shotgun', pitch: 0.6, power: 1 }, { name: 'explosion', pitch: 2.4, power: 0.3 }],
  },
  'enemy-fire': { particles: [{ kind: 'muzzle', count: 4, scale: 0.7, colors: [0xffd0b0, 0xff8a5c] }], sfx: [{ name: 'gunshot-rifle', pitch: 0.8, power: 0.5 }] },
  'impact-wall': {
    particles: [{ kind: 'impact', count: 8, scale: 0.6 }, { kind: 'debris', count: 5, scale: 0.6 }, { kind: 'dust', count: 3, scale: 0.5 }],
    sfx: [{ name: 'hit', pitch: 2.4, power: 0.28 }],
  },
  'impact-floor': { particles: [{ kind: 'dust', count: 5, scale: 0.7 }, { kind: 'debris', count: 4, scale: 0.5 }], sfx: [{ name: 'hit', pitch: 2, power: 0.25 }] },
  'enemy-hit': { shake: 0.04, glow: 0xffffff, squash: [1.12, 0.9], particles: [{ kind: 'spark', count: 6, scale: 0.8, colors: [0xff7a5c, 0xff3b3b, 0xffe9a8] }], sfx: [{ name: 'hit', pitch: 1.1, power: 0.7 }] },
  'enemy-crit': {
    shake: 0.12,
    hitStop: 35,
    glow: 0xffd37a,
    textKind: 'crit',
    particles: [{ kind: 'spark', count: 12, colors: [0xffffff, 0xffd37a, 0xff7a3d] }],
    sfx: [{ name: 'hit', pitch: 0.8, power: 0.8 }, { name: 'critical', power: 0.7 }],
  },
  'bullet-whiz': { sfx: [{ name: 'swing', pitch: 2.3, power: 0.22 }] },
  'hit-marker': { aberration: 0.12, sfx: [{ name: 'ui-click', pitch: 1.9, power: 0.55 }] },
  'kill-confirm': {
    shake: 0.2,
    hitStop: 45,
    slowMo: [0.35, 0.16],
    flash: 0.1,
    flashColor: 0xff5050,
    aberration: 0.35,
    particles: [{ kind: 'impact', count: 14, colors: [0xff6b5c, 0xffb199, 0xffffff] }, { kind: 'debris', count: 8, colors: [0x7a2b2b, 0x4a1d1d] }],
    sfx: [{ name: 'powerup', pitch: 1.5, power: 0.35 }, { name: 'death', pitch: 1.6, power: 0.4 }],
  },
  explosion: {
    shake: 0.85,
    hitStop: 60,
    flash: 0.45,
    flashColor: 0xffd28a,
    aberration: 1,
    particles: [{ kind: 'debris', count: 16 }, { kind: 'spark', count: 14, scale: 1.3 }, { kind: 'dust', count: 10, scale: 1.6 }],
    sfx: [{ name: 'explosion', pitch: 1, power: 1 }],
  },
  'player-hurt': { shake: 0.45, hitStop: 60, flash: 0.32, flashColor: 0xff3b3b, aberration: 1, sfx: [{ name: 'hurt', pitch: 1, power: 0.9 }] },
  'player-down': {
    shake: 0.7,
    hitStop: 100,
    slowMo: [0.3, 0.5],
    flash: 0.5,
    flashColor: 0x900000,
    flashSeconds: 0.5,
    aberration: 1,
    sfx: [{ name: 'death', pitch: 0.8, power: 1 }],
  },
  'reload-start': { sfx: [{ name: 'reload', power: 0.8 }] },
  'reload-done': { sfx: [{ name: 'reload', pitch: 1.35, power: 0.5 }, { name: 'block', pitch: 1.9, power: 0.3 }] },
  'weapon-switch': { sfx: [{ name: 'ui-click', pitch: 0.85, power: 0.6 }, { name: 'swing', pitch: 1.8, power: 0.3 }] },
  'dry-fire': { sfx: [{ name: 'empty-click', power: 0.7 }] },
  'casing-land': { sfx: [{ name: 'coin', pitch: 1.5, power: 0.1 }] },
  'wave-start': { shake: 0.15, flash: 0.08, flashColor: 0x9ec5ff, sfx: [{ name: 'door', pitch: 0.7, power: 0.7 }, { name: 'powerup', pitch: 0.6, power: 0.3 }] },
  respawn: { flash: 0.35, flashColor: 0xffffff, flashSeconds: 0.5, sfx: [{ name: 'win', pitch: 0.7, power: 0.35 }] },
};

/**
 * The outward normal of the face of an axis-aligned box that `point` (on or near its
 * surface) is closest to. Bullet decals and impact sparks use it to sit flush on a crate.
 * @param {{ min: readonly number[], max: readonly number[] }} box
 * @param {readonly number[]} point
 * @returns {[number, number, number]}
 */
export function faceNormal(box, point) {
  /** @type {[number, number, number][]} */
  const normals = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  const distances = [
    Math.abs((point[0] ?? 0) - (box.min[0] ?? 0)), Math.abs((point[0] ?? 0) - (box.max[0] ?? 0)),
    Math.abs((point[1] ?? 0) - (box.min[1] ?? 0)), Math.abs((point[1] ?? 0) - (box.max[1] ?? 0)),
    Math.abs((point[2] ?? 0) - (box.min[2] ?? 0)), Math.abs((point[2] ?? 0) - (box.max[2] ?? 0)),
  ];
  let best = 0;
  for (let i = 1; i < 6; i += 1) if ((distances[i] ?? Infinity) < (distances[best] ?? Infinity)) best = i;
  return /** @type {[number, number, number]} */ (normals[best]);
}

/**
 * Where an ejected shell casing starts moving: out to the gun's right, a little up and back,
 * with a spread drawn from `rng` (the kit rng, so a replay ejects the same casings).
 * @param {{ next(): number }} rng
 * @param {readonly number[]} right the camera's right vector
 * @param {readonly number[]} forward the aim direction
 * @returns {{ velocity: [number, number, number], spin: [number, number, number] }}
 */
export function casingEject(rng, right, forward) {
  const side = 2.2 + rng.next() * 1.4;
  const up = 2.4 + rng.next() * 1.2;
  const back = -0.6 + rng.next() * -0.8;
  return {
    velocity: [(right[0] ?? 0) * side + (forward[0] ?? 0) * back, up, (right[2] ?? 0) * side + (forward[2] ?? 0) * back],
    spin: [rng.next() * 20 - 10, rng.next() * 30 - 15, rng.next() * 20 - 10],
  };
}

/** Marker scale for a hit marker: kills are bigger than hits, crits in between. @param {'hit' | 'crit' | 'kill'} kind */
export const markerScale = (kind) => (kind === 'kill' ? 1.7 : kind === 'crit' ? 1.3 : 1);
