// @ts-check
/**
 * Midnite game kit — top-down car handling (engine-free).
 *
 * `car2dStep(state, input, dt)` is the original-GTA model: throttle accelerates
 * along the heading, steering turns the car in proportion to its speed (a
 * stopped car does not spin), drag and a lateral grip term stop it sliding like
 * ice. Units are px, seconds and radians.
 */

export const CAR_DEFAULTS = { accel: 260, brake: 420, maxSpeed: 320, maxReverse: 110, turnRate: 2.6, drag: 0.9, grip: 6 };

/** @param {Partial<{ x: number, y: number, heading: number, vx: number, vy: number }>} [at] */
export function createCar(at = {}) {
  return { x: 0, y: 0, heading: 0, vx: 0, vy: 0, ...at };
}

/** @typedef {ReturnType<typeof createCar>} Car */

/**
 * @param {Car} state
 * @param {{ throttle: number, steer: number }} input throttle -1..1 (negative brakes then reverses), steer -1..1
 * @param {number} dt seconds
 * @param {typeof CAR_DEFAULTS} [tune]
 * @returns {Car} a new state
 */
export function car2dStep(state, input, dt, tune = CAR_DEFAULTS) {
  const fx = Math.cos(state.heading);
  const fy = Math.sin(state.heading);
  const forwardSpeed = state.vx * fx + state.vy * fy;
  // Steering authority scales with speed, and flips when reversing.
  const authority = Math.min(1, Math.abs(forwardSpeed) / 80) * Math.sign(forwardSpeed || 1);
  const heading = state.heading + input.steer * tune.turnRate * authority * dt;
  const nx = Math.cos(heading);
  const ny = Math.sin(heading);

  let speedForward = forwardSpeed;
  if (input.throttle > 0) speedForward += (speedForward < 0 ? tune.brake : tune.accel) * input.throttle * dt;
  else if (input.throttle < 0) speedForward += (speedForward > 0 ? -tune.brake : -tune.accel * 0.6) * -input.throttle * dt;
  speedForward *= 1 - Math.min(1, tune.drag * dt);
  speedForward = Math.max(-tune.maxReverse, Math.min(tune.maxSpeed, speedForward));

  // Lateral velocity (relative to the new heading) bleeds off by `grip`.
  const lateral = -state.vx * ny + state.vy * nx;
  const lateralKept = lateral * Math.max(0, 1 - tune.grip * dt);
  const vx = nx * speedForward - ny * lateralKept;
  const vy = ny * speedForward + nx * lateralKept;
  return { x: state.x + vx * dt, y: state.y + vy * dt, heading, vx, vy };
}

/** Speed in px/s. @param {Car} car */
export const carSpeed = (car) => Math.hypot(car.vx, car.vy);
