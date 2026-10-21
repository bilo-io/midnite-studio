// @ts-check
/**
 * Midnite game kit — Phase 106 sprite animations in Phaser.
 *
 * A sprite export folder (`<asset>.sprite/`) holds `atlas.png` + `atlas.json`
 * (Phaser JSON-hash, which is also Aseprite JSON) and `anims.json` (Phaser's
 * `AnimationManager.fromJSON` shape, keys `<asset>/<clip>/<dir>`). Without
 * `anims.json`, animations are built from the atlas's `meta.frameTags`.
 * `createAnimator` then plays a clip facing any direction: the nearest one the
 * sprite was drawn in (8 → 4 → 1).
 */

import { animName, asepriteAnimDefs } from '../core/anim-names.js';

/**
 * Queue a sprite's files in `preload()`.
 * @param {Phaser.Scene} scene
 * @param {string} asset texture key, also the animation-key prefix
 * @param {string} base folder URL, e.g. `./assets/sprite/hero`
 * @param {{ anims?: boolean }} [options] `anims: false` when the export has no `anims.json`
 */
export function preloadSprite(scene, asset, base, options = {}) {
  scene.load.atlas(asset, `${base}/atlas.png`, `${base}/atlas.json`);
  if (options.anims !== false) scene.load.json(`${asset}-anims`, `${base}/anims.json`);
}

/**
 * Register a loaded sprite's animations, in `create()`. Returns the keys added.
 * @param {Phaser.Scene} scene
 * @param {string} asset
 */
export function registerAnimations(scene, asset) {
  const json = scene.cache.json.get(`${asset}-anims`);
  if (json) {
    const before = new Set(scene.anims.anims.keys());
    scene.anims.fromJSON(json);
    return scene.anims.anims.keys().filter((key) => !before.has(key));
  }
  const atlas = scene.textures.get(asset);
  const source = /** @type {{ customData?: unknown }} */ (atlas).customData;
  // Phaser keeps the atlas JSON's extra fields (`meta`) on the texture's customData.
  const data = { frames: atlas.getFrameNames(), meta: /** @type {{ meta?: unknown }} */ (source ?? {}).meta };
  /** @type {string[]} */
  const added = [];
  for (const def of asepriteAnimDefs(asset, { frames: Object.fromEntries(data.frames.map((n) => [n, {}])), meta: data.meta })) {
    if (scene.anims.exists(def.key)) continue;
    scene.anims.create({
      key: def.key,
      frames: def.frames.map((frame) => ({ key: asset, frame })),
      frameRate: def.frameRate,
      repeat: def.repeat,
    });
    added.push(def.key);
  }
  return added;
}

/**
 * @param {Phaser.GameObjects.Sprite} sprite
 * @param {string} asset
 */
export function createAnimator(sprite, asset) {
  /** @type {readonly number[]} */
  let facing = [0, 1];
  return {
    get facing() {
      return facing;
    },
    /**
     * Play `clip` facing `towards` (or the last facing). A missing clip is a no-op.
     * @param {string} clip
     * @param {readonly number[]} [towards] `[dx, dy]`
     */
    play(clip, towards) {
      if (towards && (towards[0] !== 0 || towards[1] !== 0)) facing = towards;
      const key = animName(asset, clip, facing, sprite.scene.anims.anims.keys());
      if (key) sprite.play(key, true);
      return key;
    },
  };
}
