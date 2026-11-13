// @ts-check
/**
 * Midnite game kit — levels (engine-free).
 *
 * A level is a Tiled map, one file per scene at `levels/<scene>.tmj` (Phase 132). The runner
 * starts a game on a scene with `?midnite-level=<scene>` and `window.__midnite.goto(scene)` jumps
 * a running one; `currentLevel(start)` is what a scene reads to know which file to build from.
 *
 * Two conventions share the file format. A 2D level is tile layers plus an `objects` layer. A 3D
 * level is a plan-view map of object layers: +X right, +Z down, `midnite.metresPerTile` converts
 * pixels to metres, a point is a position, a rectangle a footprint, a polyline a path, height lives
 * in custom properties (`elevation`, `sizeY`, `pitch`, `roll`, `scale`, `model`, `collider`) and yaw
 * is Tiled's own `rotation` (clockwise from above). `packages/shared/src/game-level.ts` is the
 * app's copy of `toWorld3d`; `kit-level.test.ts` holds the two to the same answers.
 */

export { collisionGrid, tiledObjects } from './tiled-objects.js';

/** The query param the runner sets; the same string as the app's `GAME_LEVEL_PARAM`. */
export const LEVEL_PARAM = 'midnite-level';
const SCENE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** @param {unknown} name */
export const isSceneName = (name) => typeof name === 'string' && SCENE_NAME.test(name);

/**
 * The level this run starts on: `?midnite-level=` when it is a valid scene name, else `fallback`.
 * @param {string} fallback
 * @param {string} [search] defaults to `location.search`
 */
export function currentLevel(fallback, search) {
  try {
    const value = new URLSearchParams(search ?? globalThis.location?.search ?? '').get(LEVEL_PARAM);
    return isSceneName(value) ? /** @type {string} */ (value) : fallback;
  } catch {
    return fallback;
  }
}

/** @param {string} name */
export const levelUrl = (name) => `levels/${name}.tmj`;

/**
 * Fetch and parse `levels/<name>.tmj`.
 * @param {string} name
 * @returns {Promise<any>}
 */
export async function fetchLevel(name) {
  if (!isSceneName(name)) throw new Error(`"${name}" is not a scene name.`);
  const response = await fetch(levelUrl(name));
  if (!response.ok) throw new Error(`Level "${name}" not found in levels/.`);
  return response.json();
}

/**
 * A Tiled `properties` array as a plain object.
 * @param {{ properties?: unknown } | null | undefined} holder a map, layer or object
 * @returns {Record<string, unknown>}
 */
export function levelProps(holder) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const list = holder?.properties;
  if (Array.isArray(list)) for (const prop of list) if (prop && typeof prop.name === 'string' && !(prop.name in out)) out[prop.name] = prop.value;
  return out;
}

/**
 * A tile layer as rows of gids (`0` empty).
 * @param {any} map
 * @param {string} layerName
 * @returns {number[][]}
 */
export function levelGrid(map, layerName) {
  const layer = Array.isArray(map?.layers) ? map.layers.find((/** @type {any} */ l) => l?.type === 'tilelayer' && l?.name === layerName) : null;
  if (!layer || !Array.isArray(layer.data)) return [];
  const width = Number(layer.width ?? map.width) || 0;
  if (width <= 0) return [];
  /** @type {number[][]} */
  const rows = [];
  for (let i = 0; i < layer.data.length; i += width) rows.push(layer.data.slice(i, i + width).map((/** @type {unknown} */ gid) => Number(gid) || 0));
  return rows;
}

/**
 * @typedef {{
 *   id: number, name: string, type: string, x: number, y: number, width: number, height: number,
 *   rotation: number, polyline: { x: number, y: number }[] | null, properties: Record<string, unknown>,
 * }} LevelEntity
 */

/**
 * An object layer's entities. `type` falls back to `class` (Tiled ≥ 1.9), as `tiledObjects` does.
 * @param {any} map
 * @param {string} [layerName]
 * @returns {LevelEntity[]}
 */
export function levelEntities(map, layerName = 'objects') {
  const layer = Array.isArray(map?.layers) ? map.layers.find((/** @type {any} */ l) => l?.type === 'objectgroup' && l?.name === layerName) : null;
  if (!layer || !Array.isArray(layer.objects)) return [];
  /** @type {LevelEntity[]} */
  const out = [];
  for (const raw of layer.objects) {
    if (!raw || typeof raw !== 'object') continue;
    out.push({
      id: Number(raw.id) || 0,
      name: typeof raw.name === 'string' ? raw.name : '',
      type: String(raw.type || raw.class || ''),
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0,
      rotation: Number(raw.rotation) || 0,
      polyline: Array.isArray(raw.polyline) ? raw.polyline.map((/** @type {any} */ p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 })) : null,
      properties: levelProps(raw),
    });
  }
  return out;
}

/** @param {unknown} v @param {number} fallback */
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * `midnite.metresPerTile`, default 1.
 * @param {any} map
 */
export function metresPerTile(map) {
  const v = finite(levelProps(map)['midnite.metresPerTile'], 1);
  return v > 0 ? v : 1;
}

const DEG = Math.PI / 180;

/**
 * A plan-view entity in world metres (Decision 3). `position[1]` is `null` when the entity has no
 * `elevation`: snap it to the terrain or `midnite.groundY`. Angles are radians; `yaw` is three's
 * `rotation.y`, so the sign is Tiled's `rotation` negated.
 * @param {LevelEntity} entity
 * @param {any} map
 * @returns {{ position: [number, number | null, number], yaw: number, pitch: number, roll: number, scale: number, size: [number, number, number] }}
 */
export function toWorld3d(entity, map) {
  const mpt = metresPerTile(map);
  const tw = Number(map?.tilewidth) || 1;
  const th = Number(map?.tileheight) || 1;
  const props = entity.properties ?? {};
  const theta = entity.rotation * DEG;
  const cx = entity.x + (entity.width / 2) * Math.cos(theta) - (entity.height / 2) * Math.sin(theta);
  const cy = entity.y + (entity.width / 2) * Math.sin(theta) + (entity.height / 2) * Math.cos(theta);
  const elevation = props.elevation;
  return {
    position: [(cx / tw) * mpt, typeof elevation === 'number' && Number.isFinite(elevation) ? elevation : null, (cy / th) * mpt],
    yaw: -entity.rotation * DEG,
    pitch: finite(props.pitch, 0) * DEG,
    roll: finite(props.roll, 0) * DEG,
    scale: finite(props.scale, 1),
    size: [(entity.width / tw) * mpt, finite(props.sizeY, 3), (entity.height / th) * mpt],
  };
}
