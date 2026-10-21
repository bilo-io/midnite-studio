// @ts-check
/**
 * Midnite game kit — a CPU fighter (engine-free).
 *
 * One decision per call from what a player can see: the distance, whether the
 * opponent is mid-attack (and at what level), and whether it is airborne. It
 * guards a telegraphed attack (crouching for lows), closes distance, punishes
 * a juggle, sidesteps now and then, and otherwise picks a move by weight. The
 * `random` source is the kit's seeded RNG, so a replay plays the same CPU.
 */

/**
 * @typedef {{
 *   distance: number,
 *   foeAttacking: 'high' | 'mid' | 'low' | null,
 *   foeAirborne: boolean,
 *   foeStunned: boolean,
 *   selfBusy: boolean,
 * }} CpuView
 * @typedef {{
 *   walk: -1 | 0 | 1, sidestep: -1 | 0 | 1, guard: boolean, crouch: boolean,
 *   attack: { direction: string, button: string } | null,
 * }} CpuIntent
 */

export const CPU_LEVELS = {
  easy: { guard: 0.25, aggression: 0.04, sidestep: 0.004 },
  normal: { guard: 0.55, aggression: 0.08, sidestep: 0.008 },
  hard: { guard: 0.85, aggression: 0.14, sidestep: 0.012 },
};

/** Close enough to attack, metres. */
export const CPU_RANGE = 1.35;

/** @type {CpuIntent} */
const IDLE = { walk: 0, sidestep: 0, guard: false, crouch: false, attack: null };

/**
 * @param {CpuView} view
 * @param {() => number} random a `[0, 1)` source
 * @param {keyof typeof CPU_LEVELS} [level]
 * @returns {CpuIntent}
 */
export function cpuDecide(view, random, level = 'normal') {
  const p = CPU_LEVELS[level];
  if (view.selfBusy) return IDLE;
  if (view.foeAirborne || view.foeStunned) {
    return view.distance <= CPU_RANGE ? { ...IDLE, attack: { direction: 'n', button: 'lp' } } : { ...IDLE, walk: 1 };
  }
  if (view.foeAttacking && view.distance <= CPU_RANGE + 0.4 && random() < p.guard) {
    return { ...IDLE, guard: true, crouch: view.foeAttacking === 'low' };
  }
  if (random() < p.sidestep) return { ...IDLE, sidestep: random() < 0.5 ? -1 : 1 };
  if (view.distance > CPU_RANGE) return { ...IDLE, walk: 1 };
  if (random() < p.aggression) {
    const roll = random();
    const attack =
      roll < 0.4 ? { direction: 'n', button: 'lp' }
        : roll < 0.6 ? { direction: 'n', button: 'rk' }
          : roll < 0.8 ? { direction: 'd', button: 'lk' }
            : { direction: 'df', button: 'rp' };
    return { ...IDLE, attack };
  }
  // In range with nothing to do: hold a guard, and drift back if crowded.
  return { ...IDLE, guard: true, walk: view.distance < 0.8 ? -1 : 0 };
}
