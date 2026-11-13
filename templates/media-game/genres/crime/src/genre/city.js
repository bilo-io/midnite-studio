// @ts-check
/**
 * The starter city. Its layout is `levels/level.tmj` (Phase 132): a `buildings` tile layer (solid cells; not `collision`, so a base scene does not build them) and an
 * `objects` layer with the player spawn, three parked cars and the police station, in pixels of `TILE`. It was generated
 * once from the rule below (a grid of 14-cell blocks split by 3-cell roads, a 9 x 9 building in each); the rule stays here
 * because the genre also draws the road markings and lamp posts from it. Replace the map with one exported from the Maps tab
 * and read it with the same `collisionGrid` / `tiledObjects` calls.
 */

export const TILE = 32;
const BLOCK = 14;
const ROAD = 3;

/** Road cell: inside a road band along either axis. @param {number} x @param {number} y */
export const isRoad = (x, y) => x % BLOCK < ROAD || y % BLOCK < ROAD;

/**
 * The scene's parsed level (`levels/<scene>.tmj`), which the base scene preloaded under `level:<name>`.
 * @param {Phaser.Scene & { levelName?: string }} scene
 */
export function sceneLevel(scene) {
  return scene.cache.tilemap.get(`level:${scene.levelName ?? 'level'}`)?.data ?? { width: 0, height: 0, layers: [] };
}
