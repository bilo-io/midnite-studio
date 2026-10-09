// @ts-check
/**
 * Midnite game kit — the wanted level (engine-free).
 *
 * Levels 0-5. A crime raises the level; every 30 s spent unseen by police drops
 * it one. A reducer, so the state is plain JSON and a replay reproduces it.
 * Phase 107 Theme J's open world imports this same file.
 */

export const MAX_WANTED = 5;
export const DECAY_MS = 30000;

export const CRIME_HEAT = /** @type {Record<string, number>} */ ({ pedestrian: 1, vehicle: 1, police: 2, shooting: 1 });

export function createWanted() {
  return { level: 0, unseenMs: 0 };
}

/** @typedef {ReturnType<typeof createWanted>} Wanted */

/**
 * @param {Wanted} state
 * @param {{ type: 'crime', crime: string } | { type: 'tick', dt: number, seen: boolean } | { type: 'clear' }} event
 * @returns {Wanted} a new state
 */
export function wantedReducer(state, event) {
  switch (event.type) {
    case 'crime':
      return { level: Math.min(MAX_WANTED, state.level + (CRIME_HEAT[event.crime] ?? 1)), unseenMs: 0 };
    case 'tick': {
      if (state.level === 0) return state;
      if (event.seen) return { level: state.level, unseenMs: 0 };
      const unseenMs = state.unseenMs + event.dt;
      if (unseenMs >= DECAY_MS) return { level: state.level - 1, unseenMs: unseenMs - DECAY_MS };
      return { level: state.level, unseenMs };
    }
    case 'clear':
      return createWanted();
    default:
      return state;
  }
}

/** How many police cars a level sends, and how fast they drive (px/s). @param {number} level */
export const pursuit = (level) => ({ cars: level === 0 ? 0 : Math.min(4, level), speed: 150 + level * 25 });
