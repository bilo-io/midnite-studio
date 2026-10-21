// @ts-check
/**
 * Midnite game kit — combo strings with cancel windows (engine-free).
 *
 * A move is frame data at 60 fps, counted from 1 like the fighter's
 * (`startup` 10, `active` 3 → active on frames 10-12), plus a `cancel` window
 * `[from, to]` (inclusive, in the same frame count) during which pressing a
 * button chains into `next[button]`. A press outside the window is dropped,
 * not buffered — a mash does not chain, a rhythm does. Ground and air strings
 * start from different openers; a `launcher` sends the target (and, with
 * `rise`, the player) into the air, where the air string takes over.
 */

/**
 * @typedef {'light' | 'heavy' | 'launch'} ComboButton
 * @typedef {{
 *   name: string, startup: number, active: number, recovery: number, damage: number,
 *   cancel: [number, number], next: Partial<Record<ComboButton, string>>,
 *   launcher?: boolean, rise?: boolean, air?: boolean, knockback?: number, lunge?: number,
 * }} ComboMove
 */

/** @type {ComboMove[]} */
export const COMBO_MOVES = [
  // Ground string: light, light, light, finisher; heavy branches; launch opens the air.
  { name: 'slash-1', startup: 6, active: 3, recovery: 14, damage: 8, cancel: [9, 20], next: { light: 'slash-2', heavy: 'cleave', launch: 'launcher' }, lunge: 1.5 },
  { name: 'slash-2', startup: 6, active: 3, recovery: 14, damage: 9, cancel: [9, 20], next: { light: 'slash-3', heavy: 'cleave', launch: 'launcher' }, lunge: 1.5 },
  { name: 'slash-3', startup: 7, active: 4, recovery: 16, damage: 11, cancel: [11, 22], next: { light: 'finisher', launch: 'launcher' }, lunge: 2 },
  { name: 'finisher', startup: 10, active: 5, recovery: 24, damage: 22, cancel: [0, -1], next: {}, knockback: 6, lunge: 3 },
  { name: 'cleave', startup: 14, active: 5, recovery: 20, damage: 20, cancel: [16, 26], next: { light: 'slash-1' }, knockback: 3 },
  { name: 'launcher', startup: 9, active: 4, recovery: 18, damage: 10, cancel: [12, 22], next: { light: 'air-1' }, launcher: true, rise: true },
  // Air string.
  { name: 'air-1', startup: 5, active: 3, recovery: 12, damage: 7, cancel: [8, 17], next: { light: 'air-2' }, air: true },
  { name: 'air-2', startup: 5, active: 3, recovery: 12, damage: 7, cancel: [8, 17], next: { light: 'air-3', heavy: 'slam' }, air: true },
  { name: 'air-3', startup: 6, active: 3, recovery: 14, damage: 9, cancel: [9, 19], next: { heavy: 'slam' }, air: true },
  { name: 'slam', startup: 8, active: 4, recovery: 22, damage: 18, cancel: [0, -1], next: {}, air: true, knockback: 2 },
];

/** Which move a button starts from idle, on the ground and in the air. */
export const OPENERS = {
  ground: /** @type {Record<ComboButton, string>} */ ({ light: 'slash-1', heavy: 'cleave', launch: 'launcher' }),
  air: /** @type {Partial<Record<ComboButton, string>>} */ ({ light: 'air-1', heavy: 'slam' }),
};

export const moveTotal = (/** @type {ComboMove} */ m) => m.startup - 1 + m.active + m.recovery;

/** @param {readonly ComboMove[]} moves @param {string} name */
export const comboMove = (moves, name) => moves.find((m) => m.name === name) ?? null;

/**
 * Which part of a move frame `n` (1-based, since the move started) is in.
 * @param {ComboMove} move
 * @param {number} n
 * @returns {'startup' | 'active' | 'recovery' | 'done'}
 */
export function comboPhase(move, n) {
  if (n < move.startup) return 'startup';
  if (n < move.startup + move.active) return 'active';
  if (n <= moveTotal(move)) return 'recovery';
  return 'done';
}

/** Whether frame `n` of `move` is inside its cancel window. */
export const inCancel = (/** @type {ComboMove} */ move, /** @type {number} */ n) => n >= move.cancel[0] && n <= move.cancel[1];

/** @returns {{ move: string | null, startedAt: number, chain: number, air: boolean }} */
export function createComboState() {
  return { move: null, startedAt: 0, chain: 0, air: false };
}

/** @typedef {ReturnType<typeof createComboState>} ComboState */

/**
 * One frame of combo logic.
 *
 * - idle (or the move has finished): a button starts that button's opener for
 *   the current ground/air state
 * - inside the current move's cancel window: a button with a `next` chains
 * - anywhere else: the press is dropped
 *
 * @param {ComboState} state
 * @param {ComboButton | null} input the button pressed this frame, if any
 * @param {number} frame the game's frame counter
 * @param {{ moves?: readonly ComboMove[], air?: boolean }} [options] `air`: the player is airborne this frame
 * @returns {{ state: ComboState, started: ComboMove | null, chained: boolean, dropped: boolean }}
 */
export function comboStep(state, input, frame, options = {}) {
  const moves = options.moves ?? COMBO_MOVES;
  const air = options.air ?? state.air;
  const current = state.move ? comboMove(moves, state.move) : null;
  const n = current ? frame - state.startedAt + 1 : 0;
  const finished = !current || comboPhase(current, n) === 'done';
  const base = finished ? { move: null, startedAt: 0, chain: 0, air } : { ...state, air };
  if (!input) return { state: base, started: null, chained: false, dropped: false };

  if (finished) {
    const name = (air ? OPENERS.air : OPENERS.ground)[input];
    const move = name ? comboMove(moves, name) : null;
    if (!move) return { state: base, started: null, chained: false, dropped: true };
    return { state: { move: move.name, startedAt: frame, chain: 1, air }, started: move, chained: false, dropped: false };
  }
  const nextName = /** @type {ComboMove} */ (current).next[input];
  if (nextName && inCancel(/** @type {ComboMove} */ (current), n)) {
    const move = /** @type {ComboMove} */ (comboMove(moves, nextName));
    return { state: { move: move.name, startedAt: frame, chain: state.chain + 1, air }, started: move, chained: true, dropped: false };
  }
  return { state: base, started: null, chained: false, dropped: true };
}

/** The current move and its phase at `frame`, or null when idle. */
export function comboNow(/** @type {ComboState} */ state, /** @type {number} */ frame, /** @type {readonly ComboMove[]} */ moves = COMBO_MOVES) {
  const move = state.move ? comboMove(moves, state.move) : null;
  if (!move) return null;
  const n = frame - state.startedAt + 1;
  const phase = comboPhase(move, n);
  return phase === 'done' ? null : { move, n, phase };
}
