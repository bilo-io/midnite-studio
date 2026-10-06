// @ts-check
/**
 * Midnite game kit — Phaser adapter for named input actions.
 *
 * Wraps `kit/core/input-map.js` with Phaser's keyboard, first gamepad and
 * pointer, and samples once per scene update so `justPressed` is per frame.
 */

import Phaser from 'phaser';

import { createInputMap } from '../core/input-map.js';

/**
 * @param {Phaser.Scene} scene
 * @param {import('../core/input-map.js').Bindings} bindings
 */
export function createInput(scene, bindings) {
  /** @type {Map<string, Phaser.Input.Keyboard.Key>} */
  const keys = new Map();
  const keyboard = scene.input.keyboard;
  for (const binding of Object.values(bindings)) {
    for (const name of binding.keys ?? []) {
      if (!keys.has(name) && keyboard) keys.set(name, keyboard.addKey(name, true));
    }
  }
  const map = createInputMap(bindings, {
    isKeyDown: (name) => keys.get(name)?.isDown ?? false,
    isGamepadDown: (button) => scene.input.gamepad?.pad1?.buttons[button]?.pressed ?? false,
    isPointerDown: (button) => {
      const pointer = scene.input.activePointer;
      return button === 'right' ? pointer.rightButtonDown() : pointer.leftButtonDown();
    },
  });
  const sample = () => map.update();
  scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, sample);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, sample));
  return map;
}
