// @ts-check
/**
 * Midnite game kit — Phase 106 Tiled maps in Phaser.
 *
 * A map export (`<asset>.map/`) is a `.tmj` with its tilesets embedded, beside
 * their images. `buildTiledMap` creates every tile layer, makes the `collision`
 * layer solid (and hides it), and returns the `objects` layer as spawns, exits
 * and named points.
 */

import { tiledObjects } from '../core/tiled-objects.js';

/**
 * Queue the map JSON in `preload()`.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} url the `.tmj`
 */
export function preloadMap(scene, key, url) {
  scene.load.tilemapTiledJSON(key, url);
}

/**
 * In `create()`: load the tileset images the map names (relative to `base`),
 * then build the map. Resolves once it exists.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} base folder URL the `.tmj` sits in
 */
export async function buildTiledMap(scene, key, base) {
  const cached = /** @type {{ data?: { tilesets?: { name: string, image?: string }[] } } | undefined} */ (
    scene.cache.tilemap.get(key)
  );
  const json = cached?.data ?? {};
  const tilesets = (json.tilesets ?? []).filter((ts) => typeof ts.image === 'string');
  const pending = tilesets.filter((ts) => !scene.textures.exists(`${key}:${ts.name}`));
  if (pending.length > 0) {
    await new Promise((resolve) => {
      for (const ts of pending) scene.load.image(`${key}:${ts.name}`, `${base}/${ts.image}`);
      scene.load.once('complete', resolve);
      scene.load.start();
    });
  }

  const map = scene.make.tilemap({ key });
  const sets = tilesets.flatMap((ts) => {
    const set = map.addTilesetImage(ts.name, `${key}:${ts.name}`);
    return set ? [set] : [];
  });
  /** @type {Record<string, Phaser.Tilemaps.TilemapLayer>} */
  const layers = {};
  for (const name of map.getTileLayerNames()) {
    const layer = map.createLayer(name, sets);
    if (layer) layers[name] = layer;
  }
  const collision = layers['collision'] ?? null;
  if (collision) {
    collision.setCollisionByExclusion([-1]);
    collision.setVisible(false);
  }
  return { map, layers, collision, objects: tiledObjects(json) };
}
