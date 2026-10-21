// @ts-check
/**
 * Midnite game kit — default tuning and key bindings for the four 2D
 * perspective presets (engine-free). A starter passes overrides; everything it
 * leaves out comes from here.
 */

const MOVE = {
  left: { keys: ['LEFT', 'A'], gamepad: [14] },
  right: { keys: ['RIGHT', 'D'], gamepad: [15] },
  up: { keys: ['UP', 'W'], gamepad: [12] },
  down: { keys: ['DOWN', 'S'], gamepad: [13] },
};

export const PRESET_DEFAULTS = {
  platformer: {
    gravity: 1200, // px/s²
    runSpeed: 220, // px/s
    acceleration: 1800, // px/s²
    jumpVelocity: -460, // px/s (up)
    coyoteMs: 100,
    jumpBufferMs: 120,
    jumpCut: 0.5,
    bindings: {
      left: MOVE.left,
      right: MOVE.right,
      down: MOVE.down,
      jump: { keys: ['SPACE', 'UP', 'W', 'Z'], gamepad: [0] },
      pause: { keys: ['ESC', 'P'], gamepad: [9] },
    },
  },
  'top-down': {
    speed: 180, // px/s
    bindings: { ...MOVE, action: { keys: ['SPACE', 'J'], gamepad: [0], pointer: /** @type {const} */ ('left') }, pause: { keys: ['ESC', 'P'], gamepad: [9] } },
  },
  isometric: {
    tileWidth: 64,
    tileHeight: 32,
    speed: 4, // tiles/s
    bindings: { ...MOVE, select: { pointer: /** @type {const} */ ('left') }, pause: { keys: ['ESC', 'P'], gamepad: [9] } },
  },
  raycaster: {
    width: 320, // internal resolution, scaled up
    height: 200,
    fovDeg: 66,
    moveSpeed: 3, // cells/s
    turnSpeed: 2.6, // rad/s
    radius: 0.2, // cells: how close the player gets to a wall
    doorCell: 9, // map value that is a door
    doorOpenMs: 600,
    bindings: {
      forward: { keys: ['UP', 'W'], gamepad: [12] },
      back: { keys: ['DOWN', 'S'], gamepad: [13] },
      turnLeft: { keys: ['LEFT'], gamepad: [14] },
      turnRight: { keys: ['RIGHT'], gamepad: [15] },
      strafeLeft: { keys: ['A'], gamepad: [4] },
      strafeRight: { keys: ['D'], gamepad: [5] },
      use: { keys: ['SPACE', 'E'], gamepad: [0] },
      pause: { keys: ['ESC', 'P'], gamepad: [9] },
    },
  },
};

/** @typedef {keyof typeof PRESET_DEFAULTS} PresetName */

/**
 * Defaults merged with a starter's overrides (one level deep, plus bindings by action).
 * @template {PresetName} P
 * @param {P} preset
 * @param {Partial<(typeof PRESET_DEFAULTS)[P]>} [overrides]
 * @returns {(typeof PRESET_DEFAULTS)[P]}
 */
export function presetConfig(preset, overrides = {}) {
  const base = PRESET_DEFAULTS[preset];
  return /** @type {(typeof PRESET_DEFAULTS)[P]} */ ({
    ...base,
    ...overrides,
    bindings: { ...base.bindings, .../** @type {{ bindings?: object }} */ (overrides).bindings },
  });
}
