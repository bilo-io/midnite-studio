// @ts-check
/**
 * Midnite game kit — the soulslike stamina economy (engine-free).
 *
 * Stamina tops out at 100 and regenerates at 25/s, but only once 0.8 s have
 * passed since it was last spent. Rolls cost 20, light attacks 15, heavy
 * attacks 30. As in the genre's originals, an action is allowed while any
 * stamina remains and simply empties the bar — so stamina never goes
 * negative, and an empty bar is the punishment.
 */

export const STAMINA = Object.freeze({
  max: 100,
  regenPerS: 25,
  regenDelayS: 0.8,
  costs: Object.freeze({ roll: 20, light: 15, heavy: 30 }),
  /** Seconds into a roll during which hits pass through. */
  rollIFrames: /** @type {readonly [number, number]} */ (Object.freeze([0.1, 0.4])),
  rollSeconds: 0.6,
});

/** @typedef {keyof typeof STAMINA.costs} StaminaAction */

export function createStamina() {
  return { value: STAMINA.max, sinceSpend: Infinity };
}

/** @typedef {ReturnType<typeof createStamina>} Stamina */

/** Whether `action` may start now. */
export const canAct = (/** @type {Stamina} */ s) => s.value > 0;

/**
 * Spend for an action. Returns false (and spends nothing) when the bar is empty.
 * @param {Stamina} s
 * @param {StaminaAction} action
 */
export function spendStamina(s, action) {
  if (!canAct(s)) return false;
  s.value = Math.max(0, s.value - STAMINA.costs[action]);
  s.sinceSpend = 0;
  return true;
}

/**
 * Advance `dt` seconds. Only the part of `dt` past the regen delay refills.
 * @param {Stamina} s
 * @param {number} dt
 */
export function tickStamina(s, dt) {
  const before = s.sinceSpend;
  s.sinceSpend += dt;
  if (!Number.isFinite(before)) {
    s.value = Math.min(STAMINA.max, s.value + STAMINA.regenPerS * dt);
    return s;
  }
  const regenSeconds = Math.max(0, s.sinceSpend - Math.max(before, STAMINA.regenDelayS));
  if (s.sinceSpend > STAMINA.regenDelayS) s.value = Math.min(STAMINA.max, s.value + STAMINA.regenPerS * regenSeconds);
  return s;
}

/**
 * Whether a roll `t` seconds in is in its invulnerability window.
 * @param {number} t
 */
export const rollInvulnerable = (t) => t >= STAMINA.rollIFrames[0] && t <= STAMINA.rollIFrames[1];
