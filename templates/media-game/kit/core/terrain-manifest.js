// @ts-check
/**
 * Midnite game kit — `terrain.manifest.json` validation (engine-free).
 *
 * A plain-JS copy of the rules Midnite Studio's `TerrainManifestSchema` holds
 * an exported terrain pack to, version 1 only. Unknown keys are ignored (a
 * newer exporter may add fields without breaking older kits); a missing or
 * mistyped required field is an error naming the field.
 */

export const TERRAIN_MANIFEST_FILE = 'terrain.manifest.json';

/**
 * @typedef {[number, number, number]} Vec3
 * @typedef {{ albedo: string, normal: string }} MaterialTile
 * @typedef {{
 *   version: 1,
 *   name: string,
 *   generator: 'midnite-studio',
 *   worldSize: number,
 *   heightRange: [number, number],
 *   bounds: { min: Vec3, max: Vec3 },
 *   heightfield: { png: string, json: string },
 *   chunks: { verts: number, perSide: number, lods: { lod: number, glb: string }[] },
 *   maps: { drape?: string, splat?: string, landcover?: string, landcoverLegend?: string },
 *   materials?: { grass: MaterialTile, rock: MaterialTile, dirt: MaterialTile, snow: MaterialTile },
 *   foliage?: string,
 *   buildings?: string,
 *   roads?: string,
 *   foliageAssets?: { name: string, glb: string }[],
 * }} TerrainManifest
 * @typedef {{
 *   version: 1, resolution: number, worldSize: number, heightRange: [number, number],
 *   rowMajor: 'z', origin: 'centre',
 * }} HeightfieldInfo
 * @typedef {{ ok: true, value: T } | { ok: false, message: string }} Result
 * @template T
 */

/** @param {unknown} v */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v */
const isPath = (v) => typeof v === 'string' && v.length > 0;
/** @param {unknown} v @param {number} n */
const isTuple = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);

class ManifestError extends Error {}

/** @param {boolean} ok @param {string} field */
function need(ok, field) {
  if (!ok) throw new ManifestError(`terrain manifest: "${field}" is missing or invalid.`);
}

/**
 * @param {unknown} json the parsed `terrain.manifest.json`
 * @returns {Result<TerrainManifest>}
 */
export function parseTerrainManifest(json) {
  try {
    need(isObject(json), '(root)');
    const m = /** @type {Record<string, any>} */ (json);
    if (m.version !== 1) {
      return { ok: false, message: `terrain manifest: version ${String(m.version)} is not supported (this kit reads version 1).` };
    }
    need(typeof m.name === 'string', 'name');
    need(m.generator === 'midnite-studio', 'generator');
    need(isNum(m.worldSize) && m.worldSize > 0, 'worldSize');
    need(isTuple(m.heightRange, 2), 'heightRange');
    need(isObject(m.bounds) && isTuple(m.bounds.min, 3) && isTuple(m.bounds.max, 3), 'bounds');
    need(isObject(m.heightfield) && isPath(m.heightfield.png) && isPath(m.heightfield.json), 'heightfield');
    need(isObject(m.chunks), 'chunks');
    need(Number.isInteger(m.chunks.verts) && m.chunks.verts > 0, 'chunks.verts');
    need(Number.isInteger(m.chunks.perSide) && m.chunks.perSide > 0, 'chunks.perSide');
    need(
      Array.isArray(m.chunks.lods) &&
        m.chunks.lods.every(
          (/** @type {any} */ l) => isObject(l) && Number.isInteger(l.lod) && l.lod >= 0 && l.lod <= 3 && isPath(l.glb),
        ),
      'chunks.lods',
    );
    need(isObject(m.maps), 'maps');
    for (const key of ['drape', 'splat', 'landcover', 'landcoverLegend']) {
      need(m.maps[key] === undefined || isPath(m.maps[key]), `maps.${key}`);
    }
    if (m.materials !== undefined) {
      need(isObject(m.materials), 'materials');
      for (const key of ['grass', 'rock', 'dirt', 'snow']) {
        const tile = m.materials[key];
        need(isObject(tile) && isPath(tile.albedo) && isPath(tile.normal), `materials.${key}`);
      }
    }
    for (const key of ['foliage', 'buildings', 'roads']) {
      need(m[key] === undefined || isPath(m[key]), key);
    }
    need(
      m.foliageAssets === undefined ||
        (Array.isArray(m.foliageAssets) &&
          m.foliageAssets.every((/** @type {any} */ a) => isObject(a) && typeof a.name === 'string' && isPath(a.glb))),
      'foliageAssets',
    );
    return { ok: true, value: /** @type {TerrainManifest} */ (m) };
  } catch (error) {
    if (error instanceof ManifestError) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * `heightfield.json`, the numbers a physics collider needs beside the PNG.
 * @param {unknown} json
 * @returns {Result<HeightfieldInfo>}
 */
export function parseHeightfieldInfo(json) {
  try {
    need(isObject(json), '(root)');
    const h = /** @type {Record<string, any>} */ (json);
    if (h.version !== 1) return { ok: false, message: `heightfield.json: version ${String(h.version)} is not supported.` };
    need(Number.isInteger(h.resolution) && h.resolution > 1, 'resolution');
    need(isNum(h.worldSize) && h.worldSize > 0, 'worldSize');
    need(isTuple(h.heightRange, 2), 'heightRange');
    need(h.rowMajor === 'z', 'rowMajor');
    need(h.origin === 'centre', 'origin');
    return { ok: true, value: /** @type {HeightfieldInfo} */ (h) };
  } catch (error) {
    if (error instanceof ManifestError) return { ok: false, message: error.message.replace('terrain manifest', 'heightfield.json') };
    throw error;
  }
}

/**
 * Resolve a manifest-relative path against the manifest's own URL.
 * @param {string} manifestUrl
 * @param {string} path
 */
export function resolveTerrainPath(manifestUrl, path) {
  const page = typeof location === 'undefined' ? 'http://kit.local/' : location.href;
  const url = new URL(path, new URL(manifestUrl, page));
  return page === 'http://kit.local/' && !/^[a-z][a-z0-9+.-]*:/i.test(manifestUrl) ? url.pathname : url.href;
}
