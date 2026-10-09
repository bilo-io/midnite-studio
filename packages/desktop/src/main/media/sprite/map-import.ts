import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';

import { failure, mapMissingImage, ok, type GitOpResult } from '@midnite/studio-shared';

/**
 * Importing a Tiled map (Phase 106 Theme J). A `.tmj` comes in with its tilesets either embedded or as
 * `.tsj` files beside it (`source`), and each tileset's image somewhere relative to whichever file named
 * it. The import embeds every tileset (Phaser cannot load an external one), points each `image` at a
 * flat copy beside the map, and refuses a map whose image is missing rather than importing half of it.
 *
 * The map's own JSON is kept as Tiled wrote it otherwise — layer kinds, properties and draw orders this
 * app does not write itself pass through untouched.
 */
export type ImportedMap = {
  name: string;
  /** Asset-relative path → bytes: `map.tmj` and every image it names. */
  files: Map<string, Buffer>;
  tilesets: number;
  /** Cells on the map (`width × height`). */
  tiles: number;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

export async function readTmjForImport(path: string): Promise<GitOpResult<ImportedMap>> {
  let map: unknown;
  try {
    map = await readJson(path);
  } catch (error) {
    return failure(`Could not read ${basename(path)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(map) || map.type !== 'map' || !Array.isArray(map.layers) || !Array.isArray(map.tilesets)) return failure(`${basename(path)} is not a Tiled JSON map.`);
  if (map.infinite === true) return failure('Infinite maps are not supported. Turn off “Infinite” in the map’s properties in Tiled and save again.');

  const files = new Map<string, Buffer>();
  const taken = new Map<string, string>();
  const tilesets: Json[] = [];
  for (const entry of map.tilesets as unknown[]) {
    if (!isObject(entry) || typeof entry.firstgid !== 'number') return failure(`${basename(path)} has a tileset without a firstgid.`);
    let tileset: Json = entry;
    let base = dirname(path);
    if (typeof entry.source === 'string') {
      const source = isAbsolute(entry.source) ? entry.source : join(base, entry.source);
      if (extname(source).toLowerCase() === '.tsx') return failure(`The tileset ${basename(source)} is XML. Export it from Tiled as JSON (.tsj) and import again.`);
      let external: unknown;
      try {
        external = await readJson(source);
      } catch {
        return failure(`This map's tileset ${basename(source)} is missing.`);
      }
      if (!isObject(external)) return failure(`${basename(source)} is not a Tiled tileset.`);
      const { type: _type, version: _version, tiledversion: _tiledversion, ...fields } = external;
      tileset = { firstgid: entry.firstgid, ...fields };
      base = dirname(source);
    }
    if (typeof tileset.image !== 'string') return failure(`The tileset ${String(tileset.name ?? tileset.firstgid)} has no single image (image-collection tilesets are not supported).`);
    const imagePath = isAbsolute(tileset.image) ? tileset.image : join(base, tileset.image);
    if (!(await exists(imagePath))) return failure(mapMissingImage(basename(tileset.image)));
    // One flat folder: two different images with the same name get a numbered copy.
    let name = basename(imagePath);
    for (let n = 2; taken.has(name) && taken.get(name) !== imagePath; n += 1) name = `${basename(imagePath, extname(imagePath))}-${n}${extname(imagePath)}`;
    if (!taken.has(name)) {
      taken.set(name, imagePath);
      files.set(name, await readFile(imagePath));
    }
    tilesets.push({ ...tileset, image: name });
  }
  files.set('map.tmj', Buffer.from(`${JSON.stringify({ ...map, tilesets }, null, 2)}\n`, 'utf8'));
  const tiles = typeof map.width === 'number' && typeof map.height === 'number' ? map.width * map.height : 0;
  return ok({ name: basename(path, extname(path)), files, tilesets: tilesets.length, tiles });
}
