// @ts-check
/**
 * Midnite game kit — NPC schedules on a game clock (engine-free).
 *
 * A schedule is a list of `{ from, to, at }` blocks in game hours (0-24); a
 * block may wrap midnight (`from: 22, to: 6`). `scheduleAt` answers where an
 * NPC should be at a given hour; the game walks it there.
 */

/**
 * @typedef {{ from: number, to: number, at: string }} ScheduleBlock
 */

/** Game hour (0 ≤ h < 24) after `seconds` of play, when a day lasts `dayLength` seconds. */
export const gameHour = (/** @type {number} */ seconds, /** @type {number} */ dayLength = 600, /** @type {number} */ startHour = 8) =>
  (((startHour + (seconds / dayLength) * 24) % 24) + 24) % 24;

/** Whether `hour` falls in the block (start inclusive, end exclusive; wraps midnight). */
export function inBlock(/** @type {ScheduleBlock} */ block, /** @type {number} */ hour) {
  return block.from <= block.to ? hour >= block.from && hour < block.to : hour >= block.from || hour < block.to;
}

/**
 * Where the schedule puts the NPC at `hour`: the first matching block, else
 * `fallback` (home).
 * @param {readonly ScheduleBlock[]} schedule
 * @param {number} hour
 * @param {string} [fallback]
 */
export function scheduleAt(schedule, hour, fallback = 'home') {
  return schedule.find((b) => inBlock(b, hour))?.at ?? fallback;
}

/**
 * Validate a schedule; a block's hours are 0-24 and its place a name.
 * @param {unknown} json
 * @returns {{ ok: true, value: ScheduleBlock[] } | { ok: false, message: string }}
 */
export function validateSchedule(json) {
  if (!Array.isArray(json)) return { ok: false, message: 'A schedule is an array of blocks.' };
  for (const [i, b] of json.entries()) {
    const ok =
      typeof b === 'object' && b !== null && typeof b.at === 'string' &&
      typeof b.from === 'number' && typeof b.to === 'number' && b.from >= 0 && b.from < 24 && b.to >= 0 && b.to <= 24 && b.from !== b.to;
    if (!ok) return { ok: false, message: `Schedule block ${i} needs "from" and "to" (0-24, different) and "at".` };
  }
  return { ok: true, value: /** @type {ScheduleBlock[]} */ (json) };
}

/**
 * One step of an NPC walking toward its scheduled spot on the ground plane.
 * @param {readonly number[]} position `[x, y, z]`, moved in place
 * @param {readonly number[]} target `[x, y, z]`
 * @param {number} speed m/s
 * @param {number} dt seconds
 * @returns {boolean} true once there
 */
export function walkToward(position, target, speed, dt) {
  const p = /** @type {number[]} */ (position);
  const dx = (target[0] ?? 0) - (p[0] ?? 0);
  const dz = (target[2] ?? 0) - (p[2] ?? 0);
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= step || d < 1e-6) {
    p[0] = target[0] ?? 0;
    p[2] = target[2] ?? 0;
    return true;
  }
  p[0] = (p[0] ?? 0) + (dx / d) * step;
  p[2] = (p[2] ?? 0) + (dz / d) * step;
  return false;
}
