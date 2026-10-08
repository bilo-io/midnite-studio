// @ts-check
/**
 * Seconds in one game day, from the wizard's `options.dayNight` in `game.config.js`.
 * No option set = the original 240 s day; switched off = the clock is parked at
 * its start hour (a day so long it never moves).
 * @param {{ enabled?: boolean, minutesPerDay?: number } | undefined} dayNight
 */
export function dayLengthSeconds(dayNight) {
  if (!dayNight) return 240;
  if (!dayNight.enabled) return 1e9;
  const minutes = Number(dayNight.minutesPerDay);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 240;
}
