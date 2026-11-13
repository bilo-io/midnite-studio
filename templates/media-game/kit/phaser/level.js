// @ts-check
/**
 * Midnite game kit — building a Phaser scene from `levels/<scene>.tmj` (Phase 132).
 *
 * Two modes, because the starters and a game with real art want different things from the same file:
 * `render: false` (layout mode, what the starters use) reads positions and kinds and draws nothing —
 * the scene keeps its own lit textures and juice. `render: true` hands the map to `buildTiledMap`,
 * which draws the tile layers and makes the `collision` layer solid.
 */

import * as Phaser from 'phaser';

import { currentLevel, levelEntities, levelGrid, levelUrl, tiledObjects } from '../core/level.js';
import { buildTiledMap } from './tiled.js';

/**
 * Queue `levels/<name>.tmj` in `preload()` under the key `level:<name>`.
 * @param {Phaser.Scene} scene
 * @param {string} name
 */
export function preloadLevel(scene, name) {
  scene.load.tilemapTiledJSON(`level:${name}`, levelUrl(name));
}

/**
 * In `create()`: the level, after `preloadLevel`.
 * @param {Phaser.Scene} scene
 * @param {string} name
 * @param {{ render?: boolean }} [options]
 */
export async function buildLevel(scene, name, options = {}) {
  const key = `level:${name}`;
  const cached = /** @type {{ data?: any } | undefined} */ (scene.cache.tilemap.get(key));
  const map = cached?.data ?? {};
  if (options.render === true) {
    const built = await buildTiledMap(scene, key, 'levels');
    return { map, ...built, grid: (/** @type {string} */ layer) => levelGrid(map, layer), entities: levelEntities(map), spawn: built.objects.spawns[0] ?? null };
  }
  return {
    map,
    grid: (/** @type {string} */ layer) => levelGrid(map, layer),
    entities: levelEntities(map),
    spawn: tiledObjects(map).spawns[0] ?? null,
  };
}

/**
 * A scene that knows which level it is on. `init(data)` takes `data.level` (what `goto` passes when it
 * restarts the scene in place), else `?midnite-level=`, else the game's start level. Subclass it and
 * call `preloadLevel(this, this.levelName)` in `preload()`.
 */
export class KitLevelScene extends Phaser.Scene {
  /** @param {string} key @param {string} [start] */
  constructor(key, start = 'level') {
    super(key);
    this.startLevel = start;
    /** @type {string} */
    this.levelName = start;
  }

  /** @param {{ level?: string }} [data] */
  init(data) {
    this.levelName = data?.level ?? currentLevel(this.startLevel);
  }

  /** What `getState().level` reports. */
  kitState() {
    return { level: this.levelName };
  }
}
