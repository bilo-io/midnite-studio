// @ts-check
/**
 * Midnite game kit — the **top-down** perspective preset: 8-direction movement
 * at a constant speed (diagonals normalised) and a facing vector that the
 * animator and attacks read.
 */

import { presetConfig } from '../../core/preset-defaults.js';
import { createInput } from '../input.js';
import { placeholderTexture } from '../scenes.js';

/**
 * @param {Phaser.Scene} scene a scene running Arcade physics (no gravity)
 * @param {Partial<typeof import('../../core/preset-defaults.js').PRESET_DEFAULTS['top-down']> & {
 *   x?: number, y?: number, texture?: string,
 *   solids?: Phaser.Types.Physics.Arcade.ArcadeColliderType,
 *   animator?: { play(clip: string, towards?: readonly number[]): unknown },
 * }} [config]
 */
export function createTopDown(scene, config = {}) {
  const cfg = presetConfig('top-down', config);
  const texture = config.texture ?? placeholderTexture(scene, 'kit-player', 20, 20, 0x6ea8ff);
  const player = scene.physics.add.sprite(config.x ?? 64, config.y ?? 64, texture);
  const body = /** @type {Phaser.Physics.Arcade.Body} */ (player.body);
  body.setAllowGravity(false);
  player.setCollideWorldBounds(true);
  if (config.solids) scene.physics.add.collider(player, config.solids);

  const input = createInput(scene, cfg.bindings);
  /** @type {[number, number]} */
  let facing = [0, 1];

  return {
    player,
    input,
    get facing() {
      return facing;
    },
    update() {
      const v = input.vector();
      body.setVelocity(v.x * cfg.speed, v.y * cfg.speed);
      if (v.x !== 0 || v.y !== 0) {
        facing = [Math.sign(v.x), Math.sign(v.y)];
        config.animator?.play('walk', facing);
      } else {
        config.animator?.play('idle');
      }
      player.setDepth(player.y);
    },
    state() {
      return { player: { position: [Math.round(player.x), Math.round(player.y)] }, facing };
    },
  };
}
