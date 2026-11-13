// @ts-check
/**
 * The starter level lives in `levels/level.tmj` (Phase 132): a `walls` tile layer (the gid is the raycaster's wall id; 9 is
 * a door), a `sky` tile layer marking the courtyard, and an `objects` layer of enemies, pickups and the player spawn, in
 * pixels. It was authored as the text below and emitted once; edit the map (in the level editor, or Tiled), not this comment.
 *
 *   #  wall        D  door         R  red locked door     V  violet locked door
 *   P  player      g  grunt        h  health   a  ammo     k  red key   v  violet key
 *   s  shotgun     r  rocket launcher
 *   ,  open floor under the sky (a courtyard; otherwise the same as .)
 *
 * [
 *   '########################',
 *   '#P..a.#........#,,,v,,,#',
 *   '#.....#...g....#,,,h,,,#',
 *   '#.....D........R,,,,,,,#',
 *   '#..g..#........#,,,g,,,#',
 *   '###D###...r....#########',
 *   '#.....#........#.......#',
 *   '#..h..#........#...g...#',
 *   '#.....#........V.......#',
 *   '#..g..D...s....#.......#',
 *   '#..k..#........#...a...#',
 *   '########################',
 * ];
 */

/** A tile layer as rows of gids (this module stays import-free so plain node can read it). */
function layerRows(/** @type {any} */ map, /** @type {string} */ name) {
  const layer = (map?.layers ?? []).find((/** @type {any} */ l) => l.type === 'tilelayer' && l.name === name);
  const width = Number(layer?.width ?? map?.width) || 0;
  /** @type {number[][]} */
  const rows = [];
  if (layer && width > 0) for (let i = 0; i < layer.data.length; i += width) rows.push(layer.data.slice(i, i + width));
  return rows;
}

/**
 * The scene's parsed level (`levels/<scene>.tmj`), which the base scene preloaded under `level:<name>`.
 * @param {Phaser.Scene & { levelName?: string }} scene
 */
export function sceneLevel(scene) {
  return scene.cache.tilemap.get(`level:${scene.levelName ?? 'level'}`)?.data ?? { width: 0, height: 0, layers: [] };
}

/**
 * Cells open to the sky, as a `(cellX, cellY) => boolean` for the raycaster's `setSky`: the `sky` layer's painted cells. The
 * east hall is a courtyard: no roof, so the ceiling there is the sky and the room tone gives way to wind. Everything else
 * keeps its stone ceiling.
 * @param {any} map
 */
export function skylitCells(map) {
  const open = new Set();
  layerRows(map, 'sky').forEach((row, y) => row.forEach((gid, x) => gid && open.add(`${x},${y}`)));
  return (/** @type {number} */ x, /** @type {number} */ y) => open.has(`${x},${y}`);
}

/**
 * The `walls` layer as rows of wall ids (unlike `collisionGrid`, which flattens to 0/1).
 * @param {any} map
 */
export function wallGrid(map) {
  return layerRows(map, 'walls');
}

/**
 * Objects with their grid positions (cell centres), grouped by Tiled type: pixels over the map's tile size.
 * @param {any} map
 */
export function levelObjects(map) {
  const cell = Number(map?.tilewidth) || 64;
  const layer = (map?.layers ?? []).find((/** @type {any} */ l) => l.type === 'objectgroup');
  return (layer?.objects ?? []).map((/** @type {any} */ o) => ({ name: o.name ?? '', type: String(o.type || o.class || ''), x: o.x / cell, y: o.y / cell }));
}
