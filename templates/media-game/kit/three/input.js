// @ts-check
/**
 * Midnite game kit — DOM adapter for named input actions (three.js games).
 *
 * Wraps `kit/core/input-map.js` with the keyboard (by `KeyboardEvent.code`),
 * the first connected gamepad, the mouse buttons and mouse-look deltas.
 * `update()` is called by the loop once per fixed step, so `justPressed`
 * fires on exactly one step.
 */

import { domKeyName } from '../core/dom-keys.js';
import { createInputMap } from '../core/input-map.js';

/**
 * @param {import('../core/input-map.js').Bindings} bindings
 * @param {{ target?: HTMLElement | Window }} [options]
 */
export function createInput(bindings, options = {}) {
  const target = options.target ?? window;
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Set<'left' | 'right'>} */
  const buttons = new Set();
  // Presses since the last sample: a tap shorter than one fixed step still counts once.
  /** @type {Set<string>} */
  const tapped = new Set();
  let lookX = 0;
  let lookY = 0;

  /** @param {Event} e */
  const onKeyDown = (e) => {
    const name = domKeyName(/** @type {KeyboardEvent} */ (e).code);
    keys.add(name);
    tapped.add(`key:${name}`);
  };
  /** @param {Event} e */
  const onKeyUp = (e) => keys.delete(domKeyName(/** @type {KeyboardEvent} */ (e).code));
  /** @param {Event} e */
  const onMouseDown = (e) => {
    const button = /** @type {MouseEvent} */ (e).button === 2 ? 'right' : 'left';
    buttons.add(button);
    tapped.add(`pointer:${button}`);
  };
  /** @param {Event} e */
  const onMouseUp = (e) => buttons.delete(/** @type {MouseEvent} */ (e).button === 2 ? 'right' : 'left');
  /** @param {Event} e */
  const onMouseMove = (e) => {
    const m = /** @type {MouseEvent} */ (e);
    lookX += m.movementX ?? 0;
    lookY += m.movementY ?? 0;
  };
  const onBlur = () => {
    keys.clear();
    buttons.clear();
  };
  /** @param {Event} e */
  const noMenu = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  target.addEventListener('contextmenu', noMenu);

  const pad = () => (typeof navigator.getGamepads === 'function' ? navigator.getGamepads().find(Boolean) ?? null : null);

  const map = createInputMap(bindings, {
    isKeyDown: (name) => keys.has(name) || tapped.has(`key:${name}`),
    isGamepadDown: (button) => pad()?.buttons[button]?.pressed ?? false,
    isPointerDown: (button) => buttons.has(button) || tapped.has(`pointer:${button}`),
  });

  return {
    ...map,
    /** Sample every action; call once per fixed step, before game logic. */
    update() {
      map.update();
      tapped.clear();
    },
    /**
     * Mouse-look since the last call, in pixels, plus the right stick
     * (scaled to roughly match) — the camera rigs drain this once per frame.
     */
    takeLook() {
      const gp = pad();
      const sx = gp ? deadzone(gp.axes[2] ?? 0) * 12 : 0;
      const sy = gp ? deadzone(gp.axes[3] ?? 0) * 12 : 0;
      const out = { x: lookX + sx, y: lookY + sy };
      lookX = 0;
      lookY = 0;
      return out;
    },
    /** The left stick as a move vector, or the keyboard's 8-way vector when the stick is idle. */
    move() {
      const gp = pad();
      const x = gp ? deadzone(gp.axes[0] ?? 0) : 0;
      const y = gp ? deadzone(gp.axes[1] ?? 0) : 0;
      if (x !== 0 || y !== 0) return { x, y };
      return map.vector('left', 'right', 'forward', 'back');
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      target.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('contextmenu', noMenu);
    },
  };
}

/** @param {number} v */
const deadzone = (v) => (Math.abs(v) < 0.15 ? 0 : v);
