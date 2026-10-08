// @ts-check
/**
 * Midnite game kit — default tuning and key bindings for the three.js kit
 * (engine-free). A starter passes overrides; everything it leaves out comes
 * from here. Units are metres, seconds and radians unless a name says degrees.
 */

export const THREE_BINDINGS = {
  forward: { keys: ['W', 'UP'], gamepad: [12] },
  back: { keys: ['S', 'DOWN'], gamepad: [13] },
  left: { keys: ['A', 'LEFT'], gamepad: [14] },
  right: { keys: ['D', 'RIGHT'], gamepad: [15] },
  jump: { keys: ['SPACE'], gamepad: [0] },
  sprint: { keys: ['SHIFT'], gamepad: [10] },
  interact: { keys: ['E'], gamepad: [2] },
  attack: { keys: ['J'], gamepad: [1], pointer: /** @type {const} */ ('left') },
  'lock-on': { keys: ['Q'], gamepad: [11], pointer: /** @type {const} */ ('right') },
  'camera-next': { keys: ['C'], gamepad: [9] },
  reload: { keys: ['R'], gamepad: [3] },
  pause: { keys: ['ESC', 'P'], gamepad: [8] },
};

export const CHARACTER_DEFAULTS = {
  radius: 0.35,
  halfHeight: 0.55, // capsule: total height = 2 × (halfHeight + radius) = 1.8 m
  headHeight: 1.6, // camera pivot above the feet
  walkSpeed: 2.2,
  runSpeed: 6,
  jumpVelocity: 5.5,
  gravity: 20, // m/s², downwards
  offset: 0.01, // controller skin
  maxSlopeDeg: 45,
  autostep: { maxHeight: 0.35, minWidth: 0.2, includeDynamic: true },
  snapToGround: 0.3,
  turnSpeed: 10, // rad/s the body turns to face its motion
  lookSensitivity: 0.0025, // rad per pixel of mouse motion
};

export const VEHICLE_DEFAULTS = {
  chassis: { halfExtents: [0.9, 0.4, 2.0], mass: 1200 },
  wheel: { radius: 0.38, suspensionRest: 0.35, suspensionStiffness: 28, frictionSlip: 1.6, maxTravel: 0.25 },
  // Rapier applies engine force as a raw impulse per step (not mass-scaled),
  // so it has to carry the 1200 kg chassis: ~2.5 m/s² flat-out, ~20 m/s in 8 s.
  engineForce: 3000,
  brakeForce: 40,
  maxSteerDeg: 32,
  enterDistance: 2.5,
};

/**
 * Defaults merged with overrides, one level deep.
 * @template {Record<string, unknown>} T
 * @param {T} base
 * @param {Partial<T>} [overrides]
 * @returns {T}
 */
export function withDefaults(base, overrides = {}) {
  return /** @type {T} */ ({ ...base, ...overrides });
}
