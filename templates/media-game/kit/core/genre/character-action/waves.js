// @ts-check
/**
 * Midnite game kit — enemy waves in an arena (engine-free).
 *
 * An arena is a list of waves; each wave lists how many of which enemy and
 * from which spawn points. The arena seals when it starts, sends the next
 * wave a short beat after the last one is cleared, and opens when every wave
 * is down. A reducer, so a replay reproduces it.
 */

/**
 * @typedef {{ kind: string, count: number }} WaveGroup
 * @typedef {{ groups: WaveGroup[] }} Wave
 * @typedef {{ status: 'idle' | 'fighting' | 'between' | 'cleared', wave: number, beat: number }} ArenaState
 */

export const WAVE_BEAT = 1.5;

/** @returns {ArenaState} */
export const createArena = () => ({ status: 'idle', wave: -1, beat: 0 });

/**
 * @param {ArenaState} state
 * @param {readonly Wave[]} waves
 * @param {{ type: 'enter' } | { type: 'tick', dt: number, alive: number }} event
 * @returns {{ state: ArenaState, spawn: Wave | null }} `spawn` is the wave to bring in now
 */
export function arenaReducer(state, waves, event) {
  if (event.type === 'enter') {
    if (state.status !== 'idle' || waves.length === 0) return { state, spawn: null };
    return { state: { status: 'fighting', wave: 0, beat: 0 }, spawn: waves[0] ?? null };
  }
  if (state.status === 'fighting' && event.alive === 0) {
    if (state.wave + 1 >= waves.length) return { state: { ...state, status: 'cleared' }, spawn: null };
    return { state: { status: 'between', wave: state.wave, beat: 0 }, spawn: null };
  }
  if (state.status === 'between') {
    const beat = state.beat + event.dt;
    if (beat >= WAVE_BEAT) {
      const wave = state.wave + 1;
      return { state: { status: 'fighting', wave, beat: 0 }, spawn: waves[wave] ?? null };
    }
    return { state: { ...state, beat }, spawn: null };
  }
  return { state, spawn: null };
}

/** Whether the arena's walls are up. */
export const arenaSealed = (/** @type {ArenaState} */ s) => s.status === 'fighting' || s.status === 'between';

/** Spread `count` spawns evenly on a ring of `radius` around `centre` (`[x, z]`), offset per wave. */
export function ringSpawns(/** @type {number} */ count, /** @type {readonly number[]} */ centre, /** @type {number} */ radius, /** @type {number} */ offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = offset + (i / Math.max(1, count)) * Math.PI * 2;
    return [(centre[0] ?? 0) + Math.cos(a) * radius, (centre[1] ?? 0) + Math.sin(a) * radius];
  });
}
