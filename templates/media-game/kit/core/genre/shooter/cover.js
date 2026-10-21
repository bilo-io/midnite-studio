// @ts-check
/**
 * Midnite game kit — cover-lite for shooter AI (engine-free).
 *
 * Works on the ground plane (`[x, z]`). Occluders are axis-aligned rectangles
 * (the footprint of a crate or a wall); a point is in cover when the segment
 * from it to the player crosses one. `pickCover` is the whole tactic: the
 * nearest cover point the player cannot see.
 */

/**
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} Rect
 * @typedef {readonly number[]} Point a `[x, z]` pair, or `[x, y, z]` (y is ignored)
 */

/** `[x, z]` of a 2- or 3-component point. @param {Point} p @returns {[number, number]} */
export const ground = (p) => (p.length >= 3 ? [p[0] ?? 0, p[2] ?? 0] : [p[0] ?? 0, p[1] ?? 0]);

/**
 * Whether segment a→b passes through `rect` (slab test).
 * @param {Point} a
 * @param {Point} b
 * @param {Rect} rect
 */
export function segmentHitsRect(a, b, rect) {
  const [ax, az] = ground(a);
  const [bx, bz] = ground(b);
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, lo, hi] of /** @type {const} */ ([[ax, bx - ax, rect.minX, rect.maxX], [az, bz - az, rect.minZ, rect.maxZ]])) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let ta = (lo - p) / d;
    let tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Whether `from` sees `to`: no occluder crosses the segment between them.
 * @param {Point} from
 * @param {Point} to
 * @param {readonly Rect[]} occluders
 */
export function hasLineOfSight(from, to, occluders) {
  return !occluders.some((rect) => segmentHitsRect(from, to, rect));
}

/**
 * Candidate cover points: the middle of each side of each occluder, pushed
 * out by `offset` metres so an agent standing there does not intersect it.
 * @param {readonly Rect[]} occluders
 * @param {number} [offset]
 * @returns {[number, number][]}
 */
export function coverPointsAround(occluders, offset = 0.8) {
  /** @type {[number, number][]} */
  const out = [];
  for (const r of occluders) {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    out.push([r.minX - offset, cz], [r.maxX + offset, cz], [cx, r.minZ - offset], [cx, r.maxZ + offset]);
  }
  return out;
}

/**
 * The nearest cover point (to `enemy`) with no line of sight to `player`, or
 * `null` when every point is exposed.
 * @template {Point} P
 * @param {Point} enemy
 * @param {Point} player
 * @param {readonly P[]} coverPoints
 * @param {readonly Rect[]} occluders
 * @returns {P | null}
 */
export function pickCover(enemy, player, coverPoints, occluders) {
  const [ex, ez] = ground(enemy);
  /** @type {P | null} */
  let best = null;
  let bestDist = Infinity;
  for (const point of coverPoints) {
    if (hasLineOfSight(point, player, occluders)) continue;
    const [px, pz] = ground(point);
    const d = Math.hypot(px - ex, pz - ez);
    if (d < bestDist) {
      best = point;
      bestDist = d;
    }
  }
  return best;
}
