// @ts-check
/**
 * Midnite game kit — a phase-based soulslike boss (engine-free).
 *
 * The boss's phase is a function of its remaining health: phase 1 above 66%,
 * phase 2 down to 33%, phase 3 below. Each phase adds attacks to the pattern
 * and speeds everything up. An attack is telegraphed (`windup`), then hits
 * (`active`), then leaves an opening (`recovery`) — the punish window the
 * player is learning to find. Times are seconds.
 */

export const BOSS_PHASE_THRESHOLDS = /** @type {const} */ ([0.66, 0.33]);

/**
 * @param {number} hpFraction remaining health, 0–1
 * @returns {1 | 2 | 3}
 */
export function bossPhase(hpFraction) {
  if (hpFraction > BOSS_PHASE_THRESHOLDS[0]) return 1;
  if (hpFraction > BOSS_PHASE_THRESHOLDS[1]) return 2;
  return 3;
}

/**
 * @typedef {{ name: string, windup: number, active: number, recovery: number, damage: number, range: number, phase: 1 | 2 | 3, weight: number }} BossAttack
 */

/** @type {readonly BossAttack[]} */
export const BOSS_ATTACKS = [
  { name: 'swipe', windup: 0.7, active: 0.25, recovery: 0.9, damage: 18, range: 3, phase: 1, weight: 3 },
  { name: 'overhead', windup: 1.1, active: 0.3, recovery: 1.3, damage: 32, range: 3.2, phase: 1, weight: 2 },
  { name: 'lunge', windup: 0.8, active: 0.4, recovery: 1.0, damage: 24, range: 7, phase: 2, weight: 2 },
  { name: 'sweep', windup: 0.9, active: 0.5, recovery: 1.1, damage: 22, range: 4.5, phase: 2, weight: 2 },
  { name: 'nova', windup: 1.4, active: 0.4, recovery: 1.6, damage: 40, range: 6, phase: 3, weight: 2 },
];

/** Every timing in phase `n` is divided by this. */
export const bossSpeed = (/** @type {1 | 2 | 3} */ phase) => [1, 1, 1.2, 1.4][phase] ?? 1;

/**
 * The next attack: drawn by weight from those unlocked by `phase` that reach
 * `distance`; `null` when nothing reaches (the boss closes in instead).
 * @param {1 | 2 | 3} phase
 * @param {number} distance metres to the player
 * @param {() => number} random a `[0, 1)` source
 * @returns {BossAttack | null}
 */
export function bossChooseAttack(phase, distance, random) {
  const options = BOSS_ATTACKS.filter((a) => a.phase <= phase && a.range >= distance);
  const total = options.reduce((sum, a) => sum + a.weight, 0);
  if (total === 0) return null;
  let roll = random() * total;
  for (const a of options) {
    roll -= a.weight;
    if (roll < 0) return a;
  }
  return options[options.length - 1] ?? null;
}

/**
 * Where an attack is `t` seconds after it began, at `phase`'s speed.
 * @param {BossAttack} attack
 * @param {number} t
 * @param {1 | 2 | 3} phase
 * @returns {'windup' | 'active' | 'recovery' | 'done'}
 */
export function bossAttackPhase(attack, t, phase) {
  const s = bossSpeed(phase);
  const w = attack.windup / s;
  const a = w + attack.active / s;
  if (t < w) return 'windup';
  if (t < a) return 'active';
  if (t < a + attack.recovery / s) return 'recovery';
  return 'done';
}
