// @ts-check
/**
 * Midnite game kit — rounds, the timer and the match (engine-free).
 *
 * A reducer over plain state so a replay reproduces it exactly. Phases run
 * `intro` → `fight` → `ko` or `timeout` → the next round's `intro`, or `over`
 * once a fighter has `roundsToWin`. A timeout goes to the fighter with more
 * health left; equal health is a draw round that nobody wins.
 */

export const ROUND_DEFAULTS = { roundsToWin: 2, roundSeconds: 60, maxHp: 170, introSeconds: 1.5, outroSeconds: 2.5 };

/** @param {Partial<typeof ROUND_DEFAULTS>} [options] */
export function createMatch(options = {}) {
  const o = { ...ROUND_DEFAULTS, ...options };
  return {
    options: o,
    round: 1,
    /** Seconds left in the round. */
    timer: o.roundSeconds,
    hp: /** @type {[number, number]} */ ([o.maxHp, o.maxHp]),
    wins: /** @type {[number, number]} */ ([0, 0]),
    /** @type {'intro' | 'fight' | 'ko' | 'timeout' | 'over'} */
    phase: 'intro',
    /** Seconds spent in the current phase. */
    phaseTime: 0,
    /** @type {0 | 1 | 'draw' | null} who took the last round (or the match, once `over`) */
    winner: /** @type {0 | 1 | 'draw' | null} */ (null),
  };
}

/** @typedef {ReturnType<typeof createMatch>} Match */

/**
 * @param {Match} m
 * @param {{ type: 'tick', dt: number } | { type: 'damage', target: 0 | 1, amount: number }} event
 * @returns {Match}
 */
export function matchReducer(m, event) {
  const s = { ...m, hp: /** @type {[number, number]} */ ([...m.hp]), wins: /** @type {[number, number]} */ ([...m.wins]) };
  if (event.type === 'damage') {
    if (s.phase !== 'fight') return m;
    s.hp[event.target] = Math.max(0, s.hp[event.target] - Math.max(0, event.amount));
    if (s.hp[event.target] === 0) endRound(s, 'ko', event.target === 0 ? 1 : 0);
    return s;
  }
  s.phaseTime += event.dt;
  if (s.phase === 'intro' && s.phaseTime >= s.options.introSeconds) {
    s.phase = 'fight';
    s.phaseTime = 0;
  } else if (s.phase === 'fight') {
    s.timer = Math.max(0, s.timer - event.dt);
    if (s.timer === 0) endRound(s, 'timeout', s.hp[0] === s.hp[1] ? 'draw' : s.hp[0] > s.hp[1] ? 0 : 1);
  } else if ((s.phase === 'ko' || s.phase === 'timeout') && s.phaseTime >= s.options.outroSeconds) {
    if (s.wins[0] >= s.options.roundsToWin || s.wins[1] >= s.options.roundsToWin) {
      s.phase = 'over';
      s.winner = s.wins[0] > s.wins[1] ? 0 : 1;
    } else {
      s.round += 1;
      s.timer = s.options.roundSeconds;
      s.hp = [s.options.maxHp, s.options.maxHp];
      s.phase = 'intro';
      s.winner = null;
    }
    s.phaseTime = 0;
  }
  return s;
}

/** @param {Match} s @param {'ko' | 'timeout'} how @param {0 | 1 | 'draw'} winner */
function endRound(s, how, winner) {
  s.phase = how;
  s.phaseTime = 0;
  s.winner = winner;
  if (winner !== 'draw') s.wins[winner] += 1;
}
