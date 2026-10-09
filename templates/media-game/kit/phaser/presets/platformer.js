// @ts-check
/**
 * Midnite game kit — the **platformer** perspective preset.
 *
 * Arcade physics with gravity, acceleration-based running, coyote time, a jump
 * buffer, variable jump height (`kit/core/jump.js`) and one-way platforms you
 * can jump up through. Works with placeholder art until a sprite is imported.
 */

import { createJumpController } from '../../core/jump.js';
import { presetConfig } from '../../core/preset-defaults.js';
import { createInput } from '../input.js';
import { placeholderTexture } from '../scenes.js';

/**
 * @param {Phaser.Scene} scene a scene running Arcade physics
 * @param {Partial<typeof import('../../core/preset-defaults.js').PRESET_DEFAULTS.platformer> & {
 *   x?: number, y?: number, texture?: string,
 *   solids?: Phaser.Types.Physics.Arcade.ArcadeColliderType,
 *   oneWay?: Phaser.Types.Physics.Arcade.ArcadeColliderType,
 * }} [config]
 */
export function createPlatformer(scene, config = {}) {
  const cfg = presetConfig('platformer', config);
  const texture = config.texture ?? placeholderTexture(scene, 'kit-player', 20, 28, 0x6ea8ff);
  const player = scene.physics.add.sprite(config.x ?? 64, config.y ?? 64, texture);
  const body = /** @type {Phaser.Physics.Arcade.Body} */ (player.body);
  body.setGravityY(cfg.gravity - scene.physics.world.gravity.y);
  body.setMaxVelocityX(cfg.runSpeed);
  body.setDragX(cfg.acceleration);
  player.setCollideWorldBounds(true);

  if (config.solids) scene.physics.add.collider(player, config.solids);
  if (config.oneWay) {
    // One-way: collide only while falling and when the feet were above the top.
    scene.physics.add.collider(player, config.oneWay, undefined, (_p, platform) => {
      const top = /** @type {{ body: { top: number } }} */ (/** @type {unknown} */ (platform)).body.top;
      return body.velocity.y >= 0 && body.prev.y + body.height <= top + 2;
    });
  }

  const input = createInput(scene, cfg.bindings);
  const jump = createJumpController(cfg);
  let facing = 1;

  return {
    player,
    input,
    /** Call from the scene's `update(time, delta)`. */
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const move = input.axis('left', 'right');
      body.setAccelerationX(move * cfg.acceleration);
      if (move !== 0) {
        facing = move;
        player.setFlipX(move < 0);
      }
      const onGround = body.blocked.down || body.touching.down;
      const next = jump.update({
        dtMs: delta,
        onGround,
        pressed: input.justPressed('jump'),
        held: input.isDown('jump'),
        vy: body.velocity.y,
      });
      if (next.vy !== body.velocity.y) body.setVelocityY(next.vy);
    },
    /** For `kitState()`. */
    state() {
      return {
        player: { position: [Math.round(player.x), Math.round(player.y)] },
        onGround: body.blocked.down || body.touching.down,
        facing,
      };
    },
  };
}
