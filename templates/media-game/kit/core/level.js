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
/** The query param Play-from-here sets: `x,y` (2D, pixels) or `x,y,z` (3D, metres). The same string as the app's `GAME_SPAWN_PARAM`. */
export const SPAWN_PARAM = 'midnite-spawn';
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

const warnedSpawn = new Set();

/**
 * The player-start override: `?midnite-spawn=x,y[,z]` as `{ x, y, z? }`, or `null` when absent or
 * malformed (the scene's own `spawn` wins, and a malformed value is logged once). Two or three
 * finite numbers only; `NaN`, `Infinity`, extra values and an empty string are rejected.
 * @param {string} [search] defaults to `location.search`
 * @returns {{ x: number, y: number, z?: number } | null}
 */
export function spawnOverride(search) {
  /** @type {string | null} */
  let raw = null;
  try {
    raw = new URLSearchParams(search ?? globalThis.location?.search ?? '').get(SPAWN_PARAM);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parts = raw.split(',');
  const nums = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
  if ((nums.length !== 2 && nums.length !== 3) || !nums.every(Number.isFinite)) {
    if (!warnedSpawn.has(raw)) {
      warnedSpawn.add(raw);
      console.warn(`midnite: ignoring malformed ?${SPAWN_PARAM}=${raw}`);
    }
    return null;
  }
  return nums.length === 3 ? { x: nums[0], y: nums[1], z: nums[2] } : { x: nums[0], y: nums[1] };
}

/**
 * A 2D spawn object moved to the override (or synthesised when the level has none); unchanged without one.
 * @template {{ x: number, y: number }} T
 * @param {T | null} spawn
 * @param {{ x: number, y: number } | null} override
 * @returns {T | { id: number, name: string, type: string, x: number, y: number, width: number, height: number, properties: Record<string, unknown> } | null}
 */
export function applySpawn2d(spawn, override) {
  if (!override) return spawn;
  if (spawn) return { ...spawn, x: override.x, y: override.y };
  return { id: 0, name: 'play-from-here', type: 'spawn', x: override.x, y: override.y, width: 0, height: 0, properties: {} };
}

/**
 * A 3D spawn position `[x, y, z]` in metres. The override's `x`,`y`,`z` are metres on X, height and Z
 * (`z` omitted: the ground height is used); the height is dropped onto the terrain when `heightAt` is known.
 * @param {[number, number, number] | null} position the level's own spawn position
 * @param {{ x: number, y: number, z?: number } | null} override
 * @param {(x: number, z: number) => number} ground
 * @returns {[number, number, number] | null}
 */
export function applySpawn3d(position, override, ground) {
  if (!override) return position;
  // 2-value form is plan X,Z; 3-value form is X, height, Z.
  if (override.z === undefined) return [override.x, ground(override.x, override.y), override.y];
  return [override.x, Math.max(override.y, ground(override.x, override.z)), override.z];
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

/**
 * What a running game says about one level object (Phase 140 D): a position in the level's units (pixels
 * for 2D; metres, `y` up, for 3D), plus whether it is alive and an optional short state name.
 * @typedef {{ x: number, y: number, z?: number, alive?: boolean, state?: string }} LiveEntityState
 */

/**
 * One entry of `window.__midnite.entities()` (`GameEntitySnapshotSchema` in the app): `id` is the level
 * object's id, or `null` for something spawned at runtime.
 * @typedef {{ id: number | null, type: string, name?: string, x: number, y: number, z?: number, alive: boolean, state?: string }} EntitySnapshot
 */

/**
 * Snapshots for a level's objects. Each reports `live(entity)` when the game supplies one (a `null`/`undefined`
 * answer means "gone": reported with `alive: false` at its authored spot), else its authored position
 * (`to`, the dimension's mapping). Layout-only objects (a `path`, an `exit`) are skipped: they are not things.
 * @param {LevelEntity[]} entities
 * @param {{ scene?: string, live?: (entity: LevelEntity) => LiveEntityState | null | undefined, to: (entity: LevelEntity) => { x: number, y: number, z?: number } }} options
 * @returns {EntitySnapshot[]}
 */
export function snapshotLevelEntities(entities, options) {
  /** @type {EntitySnapshot[]} */
  const out = [];
  for (const entity of entities) {
    if (entity.type === 'path' || entity.type === 'exit' || entity.type === 'trigger' || entity.type === 'spawn') continue;
    const authored = options.to(entity);
    /** @type {LiveEntityState | null | undefined} */
    let live;
    try {
      live = options.live ? options.live(entity) : authored;
    } catch {
      live = authored;
    }
    const at = live ?? authored;
    /** @type {EntitySnapshot} */
    const snap = { id: entity.id, type: entity.type, x: at.x, y: at.y, alive: live != null && live.alive !== false };
    if (entity.name) snap.name = entity.name;
    if (at.z !== undefined) snap.z = at.z;
    if (live && typeof live.state === 'string') snap.state = live.state.slice(0, 64);
    out.push(snap);
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

/**
 * `midnite.originX` / `midnite.originY`: the world position in metres of the map's top-left corner, default 0.
 * @param {any} map
 * @returns {{ x: number, z: number }}
 */
export function levelOrigin(map) {
  const props = levelProps(map);
  return { x: finite(props['midnite.originX'], 0), z: finite(props['midnite.originY'], 0) };
}

const ENV_SKY = ['day', 'dawn', 'dusk', 'night', 'overcast'];
const ENV_POST = ['none', 'soft', 'vivid', 'cinematic'];
/** @param {unknown} v @param {number} min @param {number} max */
const inRangeOrNull = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/**
 * `midnite.weather`, `weatherOptions`, `timeOfDay`, `timeScale` and the Phase 144 `sky`, `sunAzimuth` (deg 0-360),
 * `sunElevation` (deg -10..90), `fog`, `fogNear`, `fogFar` and `post`, read the way `levelEnvironment` in
 * `packages/shared/src/game-level.ts` reads them (`kit-level-environment.test.ts` holds the two to a table of
 * fixtures). `null` = not set, wrong type or out of range: the game's own value stands.
 * @param {any} map
 */
export function levelEnvironment(map) {
  const props = levelProps(map);
  const w = props['midnite.weather'];
  const o = props['midnite.weatherOptions'];
  const kinds = typeof o === 'string' ? o.split(',').map((k) => k.trim()).filter((k) => k && k !== 'auto') : [];
  const t = props['midnite.timeOfDay'];
  const sc = props['midnite.timeScale'];
  let fogNear = inRangeOrNull(props['midnite.fogNear'], 0, Number.MAX_SAFE_INTEGER);
  let fogFar = inRangeOrNull(props['midnite.fogFar'], 0, Number.MAX_SAFE_INTEGER);
  if (fogNear !== null && fogFar !== null && fogNear >= fogFar) {
    fogNear = null;
    fogFar = null;
  }
  const sky = props['midnite.sky'];
  const post = props['midnite.post'];
  return {
    weather: typeof w === 'string' && w.trim() ? w.trim() : 'auto',
    weatherOptions: ['auto', ...new Set(kinds)],
    timeOfDay: typeof t === 'number' && Number.isFinite(t) ? Math.min(24, Math.max(0, t)) : null,
    timeScale: typeof sc === 'number' && Number.isFinite(sc) ? Math.max(0, sc) : 1,
    sky: typeof sky === 'string' && ENV_SKY.includes(sky) ? sky : null,
    sunAzimuth: inRangeOrNull(props['midnite.sunAzimuth'], 0, 360),
    sunElevation: inRangeOrNull(props['midnite.sunElevation'], -10, 90),
    fog: typeof props['midnite.fog'] === 'boolean' ? props['midnite.fog'] : null,
    fogNear,
    fogFar,
    post: typeof post === 'string' && ENV_POST.includes(post) ? post : null,
  };
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
  const origin = levelOrigin(map);
  const tw = Number(map?.tilewidth) || 1;
  const th = Number(map?.tileheight) || 1;
  const props = entity.properties ?? {};
  const theta = entity.rotation * DEG;
  const cx = entity.x + (entity.width / 2) * Math.cos(theta) - (entity.height / 2) * Math.sin(theta);
  const cy = entity.y + (entity.width / 2) * Math.sin(theta) + (entity.height / 2) * Math.cos(theta);
  const elevation = props.elevation;
  return {
    position: [origin.x + (cx / tw) * mpt, typeof elevation === 'number' && Number.isFinite(elevation) ? elevation : null, origin.z + (cy / th) * mpt],
    yaw: -entity.rotation * DEG,
    pitch: finite(props.pitch, 0) * DEG,
    roll: finite(props.roll, 0) * DEG,
    scale: finite(props.scale, 1),
    size: [(entity.width / tw) * mpt, finite(props.sizeY, 3), (entity.height / th) * mpt],
  };
}
