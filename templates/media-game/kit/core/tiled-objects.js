// @ts-check
/**
 * Midnite game kit — reading a Tiled map's `objects` layer (engine-free).
 *
 * Phase 106 maps carry an object layer named `objects`. An object whose type
 * (Tiled ≥ 1.9 calls it `class`) is `spawn` or `exit` lands in that list; every
 * other object is a named point. Custom properties come along as a plain object.
 */

/**
 * @typedef {{ name: string, type: string, x: number, y: number, width: number, height: number, properties: Record<string, unknown> }} MapObject
 */

/**
 * @param {unknown} map a parsed `.tmj`
 * @param {string} [layerName]
 * @returns {{ spawns: MapObject[], exits: MapObject[], points: Record<string, MapObject> }}
 */
export function tiledObjects(map, layerName = 'objects') {
  /** @type {{ spawns: MapObject[], exits: MapObject[], points: Record<string, MapObject> }} */
  const out = { spawns: [], exits: [], points: {} };
  const layers = /** @type {{ layers?: unknown }} */ (map ?? {}).layers;
  if (!Array.isArray(layers)) return out;
  const layer = layers.find((entry) => entry?.type === 'objectgroup' && entry?.name === layerName);
  if (!layer || !Array.isArray(layer.objects)) return out;
  for (const raw of layer.objects) {
    if (!raw || typeof raw !== 'object') continue;
    /** @type {Record<string, unknown>} */
    const properties = {};
    if (Array.isArray(raw.properties)) {
      for (const prop of raw.properties) if (prop && typeof prop.name === 'string') properties[prop.name] = prop.value;
    }
    /** @type {MapObject} */
    const object = {
      name: typeof raw.name === 'string' ? raw.name : '',
      type: String(raw.type ?? raw.class ?? ''),
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0,
      properties,
    };
    if (object.type === 'spawn') out.spawns.push(object);
    else if (object.type === 'exit') out.exits.push(object);
    else if (object.name) out.points[object.name] = object;
  }
  return out;
}

/**
 * The `collision` tile layer's solid cells as rows of 0/1 — the same shape the
 * raycaster and grid presets read.
 * @param {unknown} map
 * @param {string} [layerName]
 * @returns {number[][]}
 */
export function collisionGrid(map, layerName = 'collision') {
  const data = /** @type {{ layers?: unknown, width?: number }} */ (map ?? {});
  if (!Array.isArray(data.layers)) return [];
  const layer = data.layers.find((entry) => entry?.type === 'tilelayer' && entry?.name === layerName);
  if (!layer || !Array.isArray(layer.data)) return [];
  const width = Number(layer.width ?? data.width) || 0;
  /** @type {number[][]} */
  const rows = [];
  for (let i = 0; i < layer.data.length; i += width) rows.push(layer.data.slice(i, i + width).map((gid) => (gid ? 1 : 0)));
  return rows;
}
