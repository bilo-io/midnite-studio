// @ts-check
/**
 * Midnite game kit — camera rig maths (engine-free).
 *
 * Five named third-person cameras, each a fixed offset from a pivot at the
 * player's head height, cycled by the `camera-next` action; a first-person
 * rig; and a sixth `versus` camera for fighters, outside the cycle. The three
 * adapter (`kit/three/cameras.js`) owns the scene objects; everything that
 * decides *where* a camera goes lives here so it can be unit-tested.
 *
 * Offsets are `[x, y, z]` in metres in the player's frame: +x to the right,
 * +y up, +z backwards (behind the player).
 */

/** The cycle order. Mirrors `GAME_CAMERA_IDS` in Midnite Studio's shared schema. */
export const CAMERA_IDS = /** @type {const} */ ([
  'over-shoulder-left',
  'over-shoulder-right',
  'behind',
  'further-behind',
  'much-further-behind',
]);

/** @typedef {(typeof CAMERA_IDS)[number]} CameraId */

/** @type {Readonly<Record<CameraId, readonly [number, number, number]>>} */
export const CAMERA_OFFSETS = Object.freeze({
  'over-shoulder-left': [-0.7, 0.2, 2.4],
  'over-shoulder-right': [0.7, 0.2, 2.4],
  behind: [0, 0.4, 4.0],
  'further-behind': [0, 1.2, 7.0],
  'much-further-behind': [0, 3.0, 12.0],
});

export const THIRD_PERSON_FOV = 60;
export const FIRST_PERSON = Object.freeze({ fov: 75, minFov: 60, maxFov: 100, bobAmplitude: 0.04, bobHz: 1.8 });
/** Metres per second the spring arm lengthens once an obstruction clears (it shortens instantly). */
export const SPRING_ARM_RELAX = 4;
export const VERSUS_CAMERA = Object.freeze({ minDistance: 4, distanceScale: 0.9, height: 1.4, fov: 50 });

/** @param {number} value @param {number} lo @param {number} hi */
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** @param {number} fov a first-person FOV setting, clamped to 60–100° */
export const clampFirstPersonFov = (fov) => clamp(fov, FIRST_PERSON.minFov, FIRST_PERSON.maxFov);

/**
 * The camera after `current` in the cycle, limited to `allowed` (the game
 * manifest's `cameraPresets`; empty or missing means all five).
 * @param {string} current
 * @param {readonly string[]} [allowed]
 * @returns {CameraId}
 */
export function nextCamera(current, allowed = []) {
  const cycle = CAMERA_IDS.filter((id) => allowed.length === 0 || allowed.includes(id));
  if (cycle.length === 0) return 'behind';
  const index = cycle.indexOf(/** @type {CameraId} */ (current));
  return cycle[(index + 1) % cycle.length] ?? cycle[0];
}

/**
 * How long the arm may be: the full `desired` length when nothing is in the
 * way, otherwise just short of the obstruction (`margin` in front of it) so the
 * near plane never clips into a wall. Never negative.
 * @param {number} desired the preset's arm length
 * @param {number | null | undefined} hitDistance distance to the first obstruction along the arm, or none
 * @param {number} [margin]
 */
export function springArmDistance(desired, hitDistance, margin = 0.2) {
  if (hitDistance == null || !(hitDistance < desired)) return desired;
  return Math.max(0, hitDistance - margin);
}

/**
 * Smooths the arm: it snaps in at once (never show the inside of a wall) but
 * eases back out at `SPRING_ARM_RELAX` m/s.
 * @param {number} current this frame's arm length
 * @param {number} target `springArmDistance(...)`
 * @param {number} dt seconds
 */
export function relaxArm(current, target, dt) {
  if (target <= current) return target;
  return Math.min(target, current + SPRING_ARM_RELAX * dt);
}

/**
 * Rotate a player-frame offset by the view's yaw (radians, 0 = looking down -z)
 * and pitch into a world-space vector from the pivot.
 * @param {readonly number[]} offset
 * @param {number} yaw
 * @param {number} [pitch]
 * @returns {[number, number, number]}
 */
export function orbitOffset(offset, yaw, pitch = 0) {
  const [ox = 0, oy = 0, oz = 0] = offset;
  // Pitch about the player's x axis first, then yaw about world y.
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y = oy * cp + oz * sp;
  const z = -oy * sp + oz * cp;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return [ox * cy + z * sy, y, -ox * sy + z * cy];
}

/**
 * The arm for a preset: its direction (unit) from the pivot and its length.
 * @param {CameraId} id
 * @param {number} yaw
 * @param {number} [pitch]
 */
export function cameraArm(id, yaw, pitch = 0) {
  const world = orbitOffset(CAMERA_OFFSETS[id], yaw, pitch);
  const length = Math.hypot(world[0], world[1], world[2]);
  return { direction: /** @type {[number, number, number]} */ (world.map((v) => v / length)), length };
}

/**
 * Head bob for the first-person rig: a vertical offset in metres that grows
 * with speed (0 when standing still).
 * @param {number} time seconds
 * @param {number} speed horizontal speed, m/s
 * @param {number} [runSpeed] the speed at which bob reaches full amplitude
 */
export function headBob(time, speed, runSpeed = 6) {
  const amount = clamp(speed / runSpeed, 0, 1);
  return Math.sin(time * Math.PI * 2 * FIRST_PERSON.bobHz) * FIRST_PERSON.bobAmplitude * amount;
}

/**
 * The best lock-on target: the nearest candidate within `maxDist` metres and
 * `maxAngleDeg` of the player's forward vector (on the ground plane), ties
 * broken by angle. `null` when nothing qualifies.
 * @template {{ position: readonly number[] }} T
 * @param {readonly number[]} player `[x, y, z]`
 * @param {readonly number[]} forward `[x, y, z]`, any length
 * @param {readonly T[]} candidates
 * @param {number} [maxDist]
 * @param {number} [maxAngleDeg]
 * @returns {T | null}
 */
export function chooseLockTarget(player, forward, candidates, maxDist = 20, maxAngleDeg = 60) {
  const fx = forward[0] ?? 0;
  const fz = forward[2] ?? 0;
  const fl = Math.hypot(fx, fz) || 1;
  const cosMax = Math.cos((maxAngleDeg * Math.PI) / 180);
  /** @type {T | null} */
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const dx = (candidate.position[0] ?? 0) - (player[0] ?? 0);
    const dz = (candidate.position[2] ?? 0) - (player[2] ?? 0);
    const dist = Math.hypot(dx, dz);
    if (dist === 0 || dist > maxDist) continue;
    const cos = (dx * fx + dz * fz) / (dist * fl);
    if (cos < cosMax - 1e-9) continue;
    // Distance first; angle (1 − cos, 0..~0.5) only separates near-equal distances.
    const score = dist + (1 - cos);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The fighter's side-on `versus` camera: centred between the two fighters,
 * pulled back perpendicular to the line joining them, far enough to frame both.
 * @param {readonly number[]} a `[x, y, z]`
 * @param {readonly number[]} b `[x, y, z]`
 * @returns {{ position: [number, number, number], target: [number, number, number] }}
 */
export function versusCamera(a, b) {
  const mid = [0, 1, 2].map((i) => ((a[i] ?? 0) + (b[i] ?? 0)) / 2);
  const dx = (b[0] ?? 0) - (a[0] ?? 0);
  const dz = (b[2] ?? 0) - (a[2] ?? 0);
  const separation = Math.hypot(dx, dz);
  const distance = Math.max(VERSUS_CAMERA.minDistance, separation * VERSUS_CAMERA.distanceScale + 2);
  // Perpendicular to a→b on the ground plane; with the fighters stacked, look down -z.
  const nx = separation > 0 ? -dz / separation : 0;
  const nz = separation > 0 ? dx / separation : 1;
  const target = /** @type {[number, number, number]} */ ([mid[0] ?? 0, (mid[1] ?? 0) + VERSUS_CAMERA.height * 0.6, mid[2] ?? 0]);
  return {
    position: [target[0] + nx * distance, target[1] + VERSUS_CAMERA.height * 0.4, target[2] + nz * distance],
    target,
  };
}

/**
 * A move vector from input (`x` right, `y` down-the-screen = backwards, as
 * `input.vector()` gives it) turned into a world-space ground direction for a
 * view at `yaw` — "forward" is wherever the camera looks.
 * @param {{ x: number, y: number }} move
 * @param {number} yaw
 * @returns {[number, number]} `[x, z]`
 */
export function moveRelativeToYaw(move, yaw) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // right = (c, −s), forward = (−s, −c); world = right·x − forward·y
  return [c * move.x + s * move.y, -s * move.x + c * move.y];
}
