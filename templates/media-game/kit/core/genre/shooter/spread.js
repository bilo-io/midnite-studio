// @ts-check
/**
 * Midnite game kit — shot spread and recoil (engine-free).
 *
 * A shot leaves along the aim direction perturbed inside a cone. The cone is
 * the weapon's base spread, doubled while moving, plus the recoil the arsenal
 * has accumulated; it is capped so a held trigger never sprays sideways.
 */

export const MAX_SPREAD_DEG = 12;
export const MOVING_SPREAD_SCALE = 2;

/**
 * The half-angle of the shot cone, in degrees.
 * @param {number} baseDeg the weapon's resting spread
 * @param {number} recoilDeg accumulated recoil
 * @param {boolean} moving whether the shooter is moving
 */
export function spreadCone(baseDeg, recoilDeg, moving) {
  const base = Math.max(0, baseDeg) * (moving ? MOVING_SPREAD_SCALE : 1);
  return Math.min(MAX_SPREAD_DEG, base + Math.max(0, recoilDeg));
}

/** @param {readonly number[]} v @returns {[number, number, number]} */
const normalise = (v) => {
  const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
  return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
};

/**
 * A unit direction inside a cone of half-angle `coneDeg` around `forward`,
 * uniform over the cone's cross-section. `random` is a `() => [0, 1)` source —
 * the kit's seeded `rng.next` in a game, so replays repeat.
 * @param {readonly number[]} forward
 * @param {number} coneDeg
 * @param {() => number} random
 * @returns {[number, number, number]}
 */
export function spreadDirection(forward, coneDeg, random) {
  const f = normalise(forward);
  if (coneDeg <= 0) return f;
  // Any vector not parallel to f, then an orthonormal basis (u, v) around it.
  const helper = Math.abs(f[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const u = normalise([
    f[1] * (helper[2] ?? 0) - f[2] * (helper[1] ?? 0),
    f[2] * (helper[0] ?? 0) - f[0] * (helper[2] ?? 0),
    f[0] * (helper[1] ?? 0) - f[1] * (helper[0] ?? 0),
  ]);
  const v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  const r = Math.tan((coneDeg * Math.PI) / 180) * Math.sqrt(random());
  const theta = random() * Math.PI * 2;
  const a = r * Math.cos(theta);
  const b = r * Math.sin(theta);
  return normalise([f[0] + u[0] * a + (v[0] ?? 0) * b, f[1] + u[1] * a + (v[1] ?? 0) * b, f[2] + u[2] * a + (v[2] ?? 0) * b]);
}

/** Angle between two directions, degrees. */
export function angleBetweenDeg(/** @type {readonly number[]} */ a, /** @type {readonly number[]} */ b) {
  const p = normalise(a);
  const q = normalise(b);
  const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  return (Math.acos(dot) * 180) / Math.PI;
}
