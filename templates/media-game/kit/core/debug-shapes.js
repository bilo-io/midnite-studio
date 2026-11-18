// @ts-check
/**
 * Midnite game kit — what the in-game debug draw shows (Phase 140 Theme G), engine-free.
 *
 * The same two sets the editor's View menu draws (`colliderShapes` / `triggerShapes` in the app's
 * `game-level-overlays.ts`; `kit-overlays-agreement.test.ts` keeps them in step): the solid parts of a level and
 * its trigger zones. `debugShapes2d` answers in map pixels, `debugBoxes3d` in world metres, so the Phaser and
 * three.js drawers only have to paint what they are given.
 */

import { levelEntities, metresPerTile, toWorld3d } from './level.js';

/** Object types drawn as triggers. */
export const DEBUG_TRIGGER_TYPES = /** @type {const} */ (['exit', 'checkpoint', 'trigger', 'hazard']);

/** @typedef {{ kind: 'poly', points: [number, number][], oneWay?: boolean } | { kind: 'point', x: number, y: number }} Shape2d */
/** @typedef {{ position: [number, number | null, number], size: [number, number, number], yaw: number }} Box3d */

const DEG = Math.PI / 180;

/**
 * A tile cell's outline in map pixels (a rectangle, or the diamond of an isometric map).
 * @param {any} map
 * @param {number} col
 * @param {number} row
 * @returns {[number, number][]}
 */
export function cellPolygon(map, col, row) {
  const tw = Number(map?.tilewidth) || 1;
  const th = Number(map?.tileheight) || 1;
  if (map?.orientation === 'isometric') {
    const ox = ((col - row + (Number(map.height) || 0) - 1) * tw) / 2;
    const oy = ((col + row) * th) / 2;
    return [[ox + tw / 2, oy], [ox + tw, oy + th / 2], [ox + tw / 2, oy + th], [ox, oy + th / 2]];
  }
  const x = col * tw, y = row * th;
  return [[x, y], [x + tw, y], [x + tw, y + th], [x, y + th]];
}

/**
 * @param {import('./level.js').LevelEntity} e
 * @returns {[number, number][] | null} the footprint's four corners, or null for a point
 */
function footprint(e) {
  if (!(e.width > 0 && e.height > 0)) return null;
  const t = e.rotation * DEG, cos = Math.cos(t), sin = Math.sin(t);
  return /** @type {[number, number][]} */ ([[0, 0], [e.width, 0], [e.width, e.height], [0, e.height]].map(([dx, dy]) => [e.x + dx * cos - dy * sin, e.y + dx * sin + dy * cos]));
}

/**
 * A 2D level's colliders and triggers in map pixels: every tile on the `collision` layer (a `kind: 'oneway'` tile
 * is marked), and each trigger-typed object's footprint (a point object becomes a marker).
 * @param {any} map a parsed `.tmj`
 * @returns {{ colliders: Shape2d[], triggers: Shape2d[] }}
 */
export function debugShapes2d(map) {
  /** @type {Shape2d[]} */
  const colliders = [];
  /** @type {Shape2d[]} */
  const triggers = [];
  const layer = Array.isArray(map?.layers) ? map.layers.find((/** @type {any} */ l) => l?.type === 'tilelayer' && l?.name === 'collision') : null;
  if (layer && Array.isArray(layer.data)) {
    const width = Number(layer.width ?? map.width) || 0;
    /** @type {any[]} */
    const tilesets = Array.isArray(map.tilesets) ? map.tilesets : [];
    layer.data.forEach((/** @type {unknown} */ raw, /** @type {number} */ i) => {
      const gid = Number(raw) & 0x1fffffff;
      if (!gid || width <= 0) return;
      let owner = null;
      for (const t of tilesets) if ((Number(t?.firstgid) || 1) <= gid) owner = t;
      const local = owner ? gid - (Number(owner.firstgid) || 1) : -1;
      const kind = owner?.tiles?.find((/** @type {any} */ t) => t?.id === local)?.properties?.find((/** @type {any} */ p) => p?.name === 'kind')?.value;
      colliders.push({ kind: 'poly', points: cellPolygon(map, i % width, Math.floor(i / width)), oneWay: kind === 'oneway' });
    });
  }
  for (const e of levelEntities(map)) {
    if (!(/** @type {readonly string[]} */ (DEBUG_TRIGGER_TYPES).includes(e.type))) continue;
    const points = footprint(e);
    triggers.push(points ? { kind: 'poly', points } : { kind: 'point', x: e.x, y: e.y });
  }
  return { colliders, triggers };
}

/**
 * A 3D level's collider and trigger volumes in world metres: a `prop` with a footprint collides unless
 * `collider: 'none'`; trigger-typed objects are zones (a point becomes a half-metre marker). `position[1]` is the
 * base height, `null` when the object has no `elevation` (the drawer snaps it to the ground).
 * @param {any} map a parsed `.tmj`
 * @returns {{ colliders: Box3d[], triggers: Box3d[] }}
 */
export function debugBoxes3d(map) {
  /** @type {Box3d[]} */
  const colliders = [];
  /** @type {Box3d[]} */
  const triggers = [];
  const mpt = metresPerTile(map);
  for (const e of levelEntities(map)) {
    const world = toWorld3d(e, map);
    const hasFootprint = e.width > 0 && e.height > 0;
    if (e.type === 'prop' && hasFootprint && e.properties.collider !== 'none') {
      colliders.push({ position: world.position, size: world.size, yaw: world.yaw });
    } else if ((/** @type {readonly string[]} */ (DEBUG_TRIGGER_TYPES)).includes(e.type)) {
      const size = /** @type {[number, number, number]} */ (hasFootprint ? world.size : [mpt / 2, mpt / 2, mpt / 2]);
      triggers.push({ position: world.position, size, yaw: world.yaw });
    }
  }
  return { colliders, triggers };
}
