// @ts-check
/**
 * Midnite game kit — vehicle helpers (engine-free): where the four wheels sit
 * on the chassis, which car a player can get into, and how input becomes
 * engine force, braking and steering. `kit/three/vehicle.js` feeds these to
 * Rapier's ray-cast vehicle controller.
 */

import { VEHICLE_DEFAULTS } from './three-defaults.js';

/**
 * Wheel connection points in chassis space, front pair first: `[x, y, z]`
 * with −z forward, so wheels 0 and 1 steer.
 * @param {readonly number[]} halfExtents `[hx, hy, hz]` of the chassis box
 * @param {number} [inset] metres in from the box's corners
 * @returns {[number, number, number][]}
 */
export function wheelLayout(halfExtents, inset = 0.25) {
  const [hx = 1, hy = 0.4, hz = 2] = halfExtents;
  const x = hx - inset * 0.4;
  const z = hz - inset;
  const y = -hy * 0.5;
  return [
    [-x, y, -z],
    [x, y, -z],
    [-x, y, z],
    [x, y, z],
  ];
}

/**
 * The nearest vehicle whose door point is within `maxDist` of the player.
 * @template {{ door: readonly number[] }} T
 * @param {readonly number[]} player `[x, y, z]`
 * @param {readonly T[]} vehicles
 * @param {number} [maxDist]
 * @returns {T | null}
 */
export function findEnterable(player, vehicles, maxDist = VEHICLE_DEFAULTS.enterDistance) {
  /** @type {T | null} */
  let best = null;
  let bestDist = Infinity;
  for (const vehicle of vehicles) {
    const d = Math.hypot(
      (vehicle.door[0] ?? 0) - (player[0] ?? 0),
      (vehicle.door[1] ?? 0) - (player[1] ?? 0),
      (vehicle.door[2] ?? 0) - (player[2] ?? 0),
    );
    if (d <= maxDist && d < bestDist) {
      best = vehicle;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Drive input → per-frame controls. `throttle` and `steer` are −1..1. Pressing
 * against the direction of travel brakes before it reverses.
 * @param {{ throttle: number, steer: number, handbrake?: boolean }} input
 * @param {number} speed signed forward speed, m/s
 * @param {Partial<typeof VEHICLE_DEFAULTS>} [tuning]
 */
export function driveControls(input, speed, tuning = {}) {
  const t = { ...VEHICLE_DEFAULTS, ...tuning };
  const reversing = input.throttle !== 0 && Math.sign(input.throttle) !== Math.sign(speed) && Math.abs(speed) > 0.5;
  return {
    engineForce: reversing ? 0 : input.throttle * t.engineForce,
    brake: input.handbrake || reversing ? t.brakeForce : 0,
    // Steering eases off at speed so a full lock at 30 m/s does not flip the car.
    steering: (-input.steer * t.maxSteerDeg * Math.PI) / 180 / (1 + Math.abs(speed) / 20),
  };
}
