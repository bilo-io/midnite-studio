// @ts-check
/**
 * Midnite game kit — fighter move lists and frame data (engine-free).
 *
 * Everything runs at 60 frames per second. A move's frames are counted from 1
 * (the frame the input is accepted). `startup` is the first active frame, the
 * way fighting-game frame data reads ("i10"): a 10/3/15 move is in startup on
 * frames 1–9, active on 10–12 and recovering on 13–27. `onHit` and `onBlock`
 * are frame advantage: positive means the attacker recovers first.
 */

export const FIGHTER_FPS = 60;

/**
 * @typedef {'high' | 'mid' | 'low'} HitLevel
 * @typedef {{
 *   name: string, input: string, startup: number, active: number, recovery: number,
 *   damage: number, onHit: number, onBlock: number, level: HitLevel, reach: number,
 *   launcher?: boolean, next?: Record<string, string>,
 * }} Move
 */

/**
 * The starter's move list. `input` is a direction (`n` neutral, `f` toward the
 * opponent, `b` away, `d` down, `df` down-forward) joined to a button (`lp`
 * light punch, `rp` right punch, `lk`, `rk`). `next` chains a string: pressing
 * that button inside the cancel window goes straight into the named move.
 * @type {readonly Move[]}
 */
export const MOVES = [
  { name: 'jab', input: 'n+lp', startup: 10, active: 3, recovery: 15, damage: 7, onHit: 8, onBlock: 1, level: 'high', reach: 1.0, next: { lp: 'jab-2', rk: 'jab-kick' } },
  { name: 'jab-2', input: '-', startup: 10, active: 3, recovery: 17, damage: 8, onHit: 6, onBlock: -2, level: 'high', reach: 1.0, next: { rp: 'jab-3' } },
  { name: 'jab-3', input: '-', startup: 12, active: 3, recovery: 22, damage: 14, onHit: 3, onBlock: -9, level: 'mid', reach: 1.1 },
  { name: 'jab-kick', input: '-', startup: 14, active: 4, recovery: 22, damage: 16, onHit: 5, onBlock: -8, level: 'mid', reach: 1.25 },
  { name: 'straight', input: 'n+rp', startup: 12, active: 3, recovery: 18, damage: 12, onHit: 5, onBlock: -3, level: 'high', reach: 1.1 },
  { name: 'mid-kick', input: 'n+rk', startup: 15, active: 4, recovery: 24, damage: 16, onHit: 4, onBlock: -9, level: 'mid', reach: 1.3 },
  { name: 'low-kick', input: 'd+lk', startup: 14, active: 3, recovery: 22, damage: 9, onHit: 2, onBlock: -12, level: 'low', reach: 1.2 },
  { name: 'step-kick', input: 'f+lk', startup: 16, active: 4, recovery: 20, damage: 15, onHit: 6, onBlock: -6, level: 'mid', reach: 1.4 },
  { name: 'uppercut', input: 'df+rp', startup: 15, active: 4, recovery: 30, damage: 15, onHit: 0, onBlock: -14, level: 'mid', reach: 1.0, launcher: true },
];

/** @param {Move} move frames from the input to the end of recovery */
export const moveTotal = (move) => move.startup - 1 + move.active + move.recovery;

/**
 * Where a move is on `frame` (counted from 1).
 * @param {Move} move
 * @param {number} frame
 * @returns {'startup' | 'active' | 'recovery' | 'done'}
 */
export function movePhase(move, frame) {
  if (frame < move.startup) return 'startup';
  if (frame < move.startup + move.active) return 'active';
  if (frame <= moveTotal(move)) return 'recovery';
  return 'done';
}

/**
 * Frames the defender is stunned when the move connects on `frame` (one of its
 * active frames): the attacker's remaining frames plus the advantage. Never
 * negative.
 * @param {Move} move
 * @param {number} frame
 * @param {boolean} blocked
 */
export function stunFrames(move, frame, blocked) {
  const remaining = moveTotal(move) - frame;
  return Math.max(0, remaining + (blocked ? move.onBlock : move.onHit));
}

/**
 * The cancel window for a string: from the first active frame to halfway
 * through recovery. A `next` press in it chains; outside it is dropped.
 * @param {Move} move
 * @param {number} frame
 */
export function inCancelWindow(move, frame) {
  return frame >= move.startup && frame <= move.startup - 1 + move.active + Math.floor(move.recovery / 2);
}

/**
 * The move a direction + button starts from neutral: an exact match, else the
 * neutral version of the button, else null.
 * @param {readonly Move[]} moves
 * @param {string} direction `n`, `f`, `b`, `d`, `df`, `db`
 * @param {string} button
 */
export function matchMove(moves, direction, button) {
  return moves.find((m) => m.input === `${direction}+${button}`) ?? moves.find((m) => m.input === `n+${button}`) ?? null;
}

/** @param {readonly Move[]} moves @param {string} name */
export const moveByName = (moves, name) => moves.find((m) => m.name === name) ?? null;

/**
 * Damage after combo scaling: the first hit is whole, each later one in the
 * same combo is 10% weaker, never below 30%.
 * @param {number} damage
 * @param {number} hitIndex 0 for the first hit of a combo
 */
export function scaleDamage(damage, hitIndex) {
  return Math.round(damage * Math.max(0.3, 0.9 ** Math.max(0, hitIndex)));
}
