// @ts-check
/**
 * Midnite game kit — named input actions (engine-free).
 *
 * Game code asks "is `jump` down?", never "is Space down?": bindings map each
 * action to keys, gamepad buttons and pointer buttons, so a preset's defaults
 * can be rebound in one place and a play-test can drive actions through any of
 * them. The engine adapter (`kit/phaser/input.js`) supplies the raw source.
 */

/**
 * @typedef {{ keys?: string[], gamepad?: number[], pointer?: 'left' | 'right' }} Binding
 * @typedef {Record<string, Binding>} Bindings
 * @typedef {{
 *   isKeyDown: (key: string) => boolean,
 *   isGamepadDown?: (button: number) => boolean,
 *   isPointerDown?: (button: 'left' | 'right') => boolean,
 * }} InputSource
 */

/**
 * A gamepad the debug hook can press (`window.__midnite.input.gamepad`): there
 * is no OS-level way to inject gamepad input, so play-tests go through this.
 */
export function createVirtualGamepad() {
  /** @type {Set<number>} */
  const down = new Set();
  return {
    set(/** @type {number} */ button, /** @type {boolean} */ pressed) {
      if (pressed) down.add(button);
      else down.delete(button);
    },
    isDown: (/** @type {number} */ button) => down.has(button),
    clear: () => down.clear(),
  };
}

/** The kit's one virtual pad, wired to the hook by `installHook`. */
export const virtualGamepad = createVirtualGamepad();

/**
 * @param {Bindings} bindings
 * @param {InputSource} source
 */
export function createInputMap(bindings, source) {
  /** @type {Map<string, boolean>} */
  let current = new Map();
  /** @type {Map<string, boolean>} */
  let previous = new Map();

  /** @param {string} action */
  const read = (action) => {
    const binding = bindings[action];
    if (!binding) return false;
    if (binding.keys?.some((key) => source.isKeyDown(key))) return true;
    if (binding.gamepad?.some((button) => source.isGamepadDown?.(button) || virtualGamepad.isDown(button))) return true;
    if (binding.pointer && source.isPointerDown?.(binding.pointer)) return true;
    return false;
  };

  const map = {
    bindings,
    /** Sample every action. Call once per fixed step, before game logic. */
    update() {
      previous = current;
      current = new Map(Object.keys(bindings).map((action) => [action, read(action)]));
    },
    isDown: (/** @type {string} */ action) => current.get(action) ?? false,
    /** True on the one update where the action went from up to down. */
    justPressed: (/** @type {string} */ action) => (current.get(action) ?? false) && !(previous.get(action) ?? false),
    justReleased: (/** @type {string} */ action) => !(current.get(action) ?? false) && (previous.get(action) ?? false),
    /**
     * -1, 0 or 1 from a pair of opposing actions.
     * @param {string} negative
     * @param {string} positive
     */
    axis(negative, positive) {
      return (map.isDown(positive) ? 1 : 0) - (map.isDown(negative) ? 1 : 0);
    },
    /**
     * An 8-direction movement vector of length 0 or 1 (diagonals normalised, so
     * moving diagonally is not ~41% faster).
     */
    vector(left = 'left', right = 'right', up = 'up', down = 'down') {
      const x = map.axis(left, right);
      const y = map.axis(up, down);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
  };
  return map;
}
