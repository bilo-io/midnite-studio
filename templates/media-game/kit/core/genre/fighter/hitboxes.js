// @ts-check
/**
 * Midnite game kit — fighter hit and hurt boxes (engine-free).
 *
 * A fighter's hurtbox is a vertical cylinder (radius 0.35 m); its top drops
 * when crouching and the whole cylinder rises while airborne. A move's hitbox
 * is a sphere `reach` metres in front of the attacker at the height its level
 * names. Positions are `[x, y, z]`, `y` the feet; `facing` is a unit `[x, z]`.
 */

export const HURT_RADIUS = 0.35;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.1;
export const HIT_RADIUS = 0.3;
/** Height above the feet a hit of each level lands at. */
export const LEVEL_HEIGHT = { high: 1.55, mid: 1.05, low: 0.3 };

/**
 * @typedef {{ position: readonly number[], crouching?: boolean }} Body
 * @typedef {{ centre: [number, number, number], radius: number }} Hitbox
 * @typedef {{ position: readonly number[], facing: readonly number[] }} Attacker
 */

/**
 * @param {Body} body
 * @returns {{ x: number, z: number, bottom: number, top: number, radius: number }}
 */
export function hurtbox(body) {
  const [x = 0, y = 0, z = 0] = body.position;
  return { x, z, bottom: y, top: y + (body.crouching ? CROUCH_HEIGHT : STAND_HEIGHT), radius: HURT_RADIUS };
}

/**
 * @param {Attacker} attacker
 * @param {{ reach: number, level: 'high' | 'mid' | 'low' }} move
 * @returns {Hitbox}
 */
export function hitbox(attacker, move) {
  const [x = 0, y = 0, z = 0] = attacker.position;
  const [fx = 1, fz = 0] = attacker.facing;
  const l = Math.hypot(fx, fz) || 1;
  return { centre: [x + (fx / l) * move.reach, y + LEVEL_HEIGHT[move.level], z + (fz / l) * move.reach], radius: HIT_RADIUS };
}

/**
 * Sphere against vertical cylinder.
 * @param {Hitbox} hit
 * @param {ReturnType<typeof hurtbox>} hurt
 */
export function overlaps(hit, hurt) {
  const [cx, cy, cz] = hit.centre;
  const dy = cy < hurt.bottom ? hurt.bottom - cy : cy > hurt.top ? cy - hurt.top : 0;
  const dxz = Math.max(0, Math.hypot(cx - hurt.x, cz - hurt.z) - hurt.radius);
  return Math.hypot(dxz, dy) <= hit.radius;
}

/**
 * What a hit of `level` does to a defender: highs whiff over a crouch; a
 * standing guard blocks highs and mids, a crouching guard blocks lows (and
 * highs, which pass over it); nobody blocks in the air, which is what makes a
 * launcher's follow-ups a juggle.
 * @param {'high' | 'mid' | 'low'} level
 * @param {{ guarding?: boolean, crouching?: boolean, airborne?: boolean }} defender
 * @returns {'hit' | 'block' | 'whiff'}
 */
export function resolveHit(level, defender) {
  if (defender.airborne) return 'hit';
  if (level === 'high' && defender.crouching) return 'whiff';
  if (!defender.guarding) return 'hit';
  if (level === 'low') return defender.crouching ? 'block' : 'hit';
  if (level === 'mid') return defender.crouching ? 'hit' : 'block';
  return 'block';
}
