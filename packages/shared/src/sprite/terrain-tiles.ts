import type { TilesetCollision } from '../media-sprite';
import { TERRAIN_CLASS_INDICES } from '../terrain/classes';
import { resizeArea, resizeNearest } from './align';
import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Phase 105 terrain → 2D tiles (Phase 106 Theme I). The terrain's `build/drape.png` (or its splat bake)
 * is cut into a `cols × rows` grid, one cell per `metresPerTile` metres of world, and identical cells
 * share one tile. The tiles become a tileset and the grid its `ground` layer; each cell's collision comes
 * from the dominant land-cover class under it (`water` → water, `building` → solid, anything else walkable).
 *
 * Isometric output re-projects every tile with `toDiamond` and ignores height — the maps are flat.
 */
export const TERRAIN_TILES_MAX_SIDE = 256;
export const TERRAIN_TILES_MAX_UNIQUE = 4096;
export const TERRAIN_ISO_FLAT_NOTE = 'Isometric maps from terrain are flat; height is not drawn.';

/** Tiles along each side for `worldSize` metres at `metresPerTile`. */
export const terrainTileGrid = (worldSize: number, metresPerTile: number): number => Math.max(1, Math.round(worldSize / metresPerTile));

/** Why this grid cannot be made, or `null`. A grid over 256 × 256 is refused. */
export function terrainGridBlocker(worldSize: number, metresPerTile: number): string | null {
  const side = terrainTileGrid(worldSize, metresPerTile);
  return side > TERRAIN_TILES_MAX_SIDE
    ? `${worldSize} m at ${metresPerTile} m per tile is ${side} × ${side} tiles; the most is ${TERRAIN_TILES_MAX_SIDE} × ${TERRAIN_TILES_MAX_SIDE}. Raise metres per tile.`
    : null;
}

export type TerrainTileCell = { image: RgbaImage; collision: TilesetCollision };

export type TerrainTiles = {
  cols: number;
  rows: number;
  /** The distinct tiles, in first-seen order. */
  tiles: TerrainTileCell[];
  /** `cols × rows` tile ids, row-major. */
  grid: Uint32Array;
};

/** The land-cover class index under a cell, as the collision it implies. */
function cellCollision(classes: Uint8Array | null, res: number, col: number, row: number, cols: number, rows: number): TilesetCollision {
  if (!classes) return 'walkable';
  const x0 = Math.floor((col * res) / cols), x1 = Math.max(x0 + 1, Math.floor(((col + 1) * res) / cols));
  const y0 = Math.floor((row * res) / rows), y1 = Math.max(y0 + 1, Math.floor(((row + 1) * res) / rows));
  const counts = new Map<number, number>();
  for (let y = y0; y < Math.min(res, y1); y += 1)
    for (let x = x0; x < Math.min(res, x1); x += 1) {
      const c = classes[y * res + x]!;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  let best = -1, bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  if (best === TERRAIN_CLASS_INDICES.water) return 'water';
  if (best === TERRAIN_CLASS_INDICES.building) return 'solid';
  return 'walkable';
}

const hashOf = (data: ArrayLike<number>, collision: string): string => {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 1) h = Math.imul(h ^ data[i]!, 16777619);
  return `${collision}:${h >>> 0}`;
};

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * Cuts `drape` into `cols × rows` tiles of `tileSize` and dedupes byte-identical ones. `classes` (the
 * terrain's `landcover.png`, `res × res` class indices) sets each cell's collision; without it every
 * cell is walkable. `pixel` resamples with nearest-neighbour rather than area averaging.
 */
export function terrainToTiles(
  drape: RgbaLike,
  cols: number,
  rows: number,
  tileSize: number,
  opts: { classes?: Uint8Array | null; res?: number; pixel?: boolean } = {},
): TerrainTiles {
  const resize = opts.pixel ? resizeNearest : resizeArea;
  const classes = opts.classes ?? null;
  const res = opts.res ?? 0;
  const tiles: TerrainTileCell[] = [];
  const buckets = new Map<string, number[]>();
  const grid = new Uint32Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    // One band of source rows at a time: the whole grid at tile size can be gigabytes.
    const y0 = Math.min(drape.height - 1, Math.floor((row * drape.height) / rows));
    const y1 = Math.min(drape.height, Math.max(y0 + 1, Math.floor(((row + 1) * drape.height) / rows)));
    const band = createRgba(drape.width, y1 - y0);
    for (let i = 0; i < band.data.length; i += 1) band.data[i] = drape.data[y0 * drape.width * 4 + i]!;
    const strip = resize(band, cols * tileSize, tileSize);
    for (let col = 0; col < cols; col += 1) {
      const image = createRgba(tileSize, tileSize);
      for (let y = 0; y < tileSize; y += 1) {
        const s = (y * strip.width + col * tileSize) * 4;
        image.data.set(strip.data.subarray(s, s + tileSize * 4), y * tileSize * 4);
      }
      const collision = cellCollision(classes, res, col, row, cols, rows);
      const key = hashOf(image.data, collision);
      const candidates = buckets.get(key) ?? [];
      let id = candidates.find((i) => sameBytes(tiles[i]!.image.data, image.data));
      if (id === undefined) {
        id = tiles.length;
        tiles.push({ image, collision });
        candidates.push(id);
        buckets.set(key, candidates);
      }
      grid[row * cols + col] = id;
    }
  }
  return { cols, rows, tiles, grid };
}

/** Why the cut produced too many distinct tiles to pack, or `null`. */
export const terrainUniqueBlocker = (unique: number): string | null =>
  unique > TERRAIN_TILES_MAX_UNIQUE ? `The terrain makes ${unique} distinct tiles; the most is ${TERRAIN_TILES_MAX_UNIQUE}. Raise metres per tile or lower the tile size.` : null;
