// @ts-check
/** Seconds in one game day when the wizard set nothing. */
export const DAY_SECONDS = 240;

/**
 * Seconds in one game day, from the wizard's `options.dayNight` in `game.config.js`.
 * No option set = the original 240 s day; switched off = the clock is parked at
 * its start hour (a day so long it never moves).
 * @param {{ enabled?: boolean, minutesPerDay?: number } | undefined} dayNight
 */
export function dayLengthSeconds(dayNight) {
  if (!dayNight) return DAY_SECONDS;
  if (!dayNight.enabled) return 1e9;
  const minutes = Number(dayNight.minutesPerDay);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : DAY_SECONDS;
}
