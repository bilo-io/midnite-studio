// @ts-check
/**
 * Midnite game kit — a scene base class and scene switching.
 *
 * `KitScene` adds `kitState()`, which `window.__midnite.getState()` merges into
 * its answer: override it to report what matters for this scene (the presets
 * return their player's position). `switchScene` fades between scenes.
 */

import * as Phaser from 'phaser';

export class KitScene extends Phaser.Scene {
  /** @param {string} key */
  constructor(key) {
    super({ key });
  }

  /**
   * Extra state for `getState()` — plain JSON only.
   * @returns {Record<string, unknown>}
   */
  kitState() {
    return {};
  }
}

/**
 * Fade out, start another scene, fade in.
 * @param {Phaser.Scene} from
 * @param {string} to
 * @param {object} [data]
 * @param {number} [ms]
 */
export function switchScene(from, to, data, ms = 250) {
  const camera = from.cameras.main;
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    from.scene.start(to, data);
    const next = from.scene.get(to);
    next.events.once(Phaser.Scenes.Events.CREATE, () => next.cameras.main.fadeIn(ms));
  });
  camera.fadeOut(ms);
}

/**
 * A placeholder texture (a filled rectangle) so a preset runs before any art
 * is imported. Returns the texture key.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {number} width
 * @param {number} height
 * @param {number} color 0xRRGGBB
 */
export function placeholderTexture(scene, key, width, height, color) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1);
  g.fillRect(0, 0, width, height);
  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}
