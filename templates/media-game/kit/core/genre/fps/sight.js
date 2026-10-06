// @ts-check
/**
 * Midnite game kit — enemy sight on a grid map (engine-free).
 *
 * `hasLineOfSight` walks the same DDA the renderer uses, so an enemy never sees
 * through a wall the player cannot. A closed door blocks sight; pass `isSolid`
 * to let an open one through.
 */

import { castRay } from '../../raycast.js';

/**
 * @param {readonly (readonly number[])[]} map
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {(cell: number, x: number, y: number) => boolean} [isSolid]
 */
export function hasLineOfSight(map, from, to, isSolid) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return true;
  const hit = castRay(map, from, { x: dx / distance, y: dy / distance }, isSolid ? { isSolid } : {});
  return !hit.hit || hit.distance >= distance;
}

/**
 * Whether `enemy` (facing `angle`, radians) can see `target`: in range, inside its
 * field of view, and unblocked.
 * @param {{ x: number, y: number, angle: number }} enemy
 * @param {{ x: number, y: number }} target
 * @param {readonly (readonly number[])[]} map
 * @param {{ range?: number, fovDeg?: number, isSolid?: (cell: number, x: number, y: number) => boolean }} [options]
 */
export function canSee(enemy, target, map, options = {}) {
  const range = options.range ?? 8;
  const fov = ((options.fovDeg ?? 120) * Math.PI) / 180;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  if (Math.hypot(dx, dy) > range) return false;
  let delta = Math.atan2(dy, dx) - enemy.angle;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) > fov / 2) return false;
  return hasLineOfSight(map, enemy, target, options.isSolid);
}
