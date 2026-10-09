import type { TilesetSpec } from '../media-sprite';
import { buildTilesetTiles, schemeConfigs, stackTiles, TILESET_COLUMNS, type TilesetBase, type TilesetTile } from './autotile';
import type { RgbaImage } from './image';
import { isoCellSize, isoFloor, isoTilesetTiles } from './iso';
import { buildTmj, buildTsj, type TiledMap, type TiledTileset } from './tiled';
import type { TerrainTiles } from './terrain-tiles';

/**
 * Assembles a tileset (Phase 106 Themes H and I) from its base tiles: the bases, one full transition set
 * per `transitions` pair, collision flags, and — for an isometric tileset — every tile re-projected to a
 * diamond floor plus a block per terrain. Pure: the caller writes `tileset.png` and `tileset.tsj`.
 */
export type AssembledTileset = {
  sheet: RgbaImage;
  tsj: TiledTileset;
  tiles: Array<Pick<TilesetTile, 'id' | 'collision' | 'image'> & { isoKind?: 'floor' | 'block' }>;
  /** Ortho tile size, or the iso cell's footprint (`2·size × 1.5·size`). */
  cell: { width: number; height: number };
};

/** Why this spec cannot be built, or `null`. */
export function tilesetBlocker(spec: Pick<TilesetSpec, 'terrains' | 'transitions' | 'fromTerrain'>): string | null {
  if (spec.fromTerrain) return null;
  const ids = spec.terrains.map((t) => t.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return `Two terrains are called ${dup}.`;
  if (ids.length < 2) return 'A tileset needs at least two terrains.';
  for (const t of spec.transitions) {
    if (t.a === t.b) return `A transition needs two different terrains (${t.a}).`;
    if (!ids.includes(t.a) || !ids.includes(t.b)) return `Transition ${t.a} → ${t.b} names a terrain the tileset does not have.`;
  }
  return null;
}

export function assembleTileset(spec: Pick<TilesetSpec, 'name' | 'style' | 'tileSize' | 'scheme' | 'seed' | 'projection' | 'transitions'>, bases: readonly TilesetBase[]): AssembledTileset {
  const size = spec.tileSize;
  const ortho = buildTilesetTiles({ scheme: spec.scheme, tileSize: size, seed: spec.seed, soft: spec.style !== 'pixel', bases, transitions: spec.transitions });
  const iso = spec.projection === 'isometric';
  const tiles: AssembledTileset['tiles'] = iso ? isoTilesetTiles(ortho).map(({ kind, ...t }) => ({ ...t, isoKind: kind })) : ortho;
  const cell = iso ? isoCellSize(size) : { width: size, height: size };
  const sheet = stackTiles(tiles, cell.width, cell.height, TILESET_COLUMNS);

  const baseTile: Record<string, number> = {};
  for (const t of ortho) if (t.kind === 'base' && t.terrain) baseTile[t.terrain] = t.id;
  const sets = spec.transitions.map(({ a, b }) => ({
    a,
    b,
    tiles: ortho.filter((t) => t.kind === 'transition' && t.a === a && t.b === b).map((t) => ({ id: t.id, config: t.config! })),
  }));
  const tsj = buildTsj({
    name: spec.name,
    tiles,
    tileWidth: cell.width,
    tileHeight: cell.height,
    columns: sheet.columns,
    imageWidth: sheet.image.width,
    imageHeight: sheet.image.height,
    scheme: spec.scheme,
    baseTile,
    sets,
    ...(iso ? { isometric: { gridWidth: size * 2, gridHeight: size } } : {}),
  });
  return { sheet: sheet.image, tsj, tiles, cell };
}

/** The number of tiles a spec produces (bases + each transition's set; isometric adds a block per base). */
export function tilesetTileCount(spec: Pick<TilesetSpec, 'terrains' | 'transitions' | 'scheme' | 'projection'>): number {
  const ortho = spec.terrains.length + spec.transitions.length * schemeConfigs(spec.scheme).length;
  return spec.projection === 'isometric' ? ortho + spec.terrains.length : ortho;
}

export type AssembledTerrainMap = { sheet: RgbaImage; tsj: TiledTileset; tmj: TiledMap; tileCount: number };

/**
 * A Phase 105 terrain cut into tiles (`terrainToTiles`) as a tileset plus the `.tmj` whose `ground`
 * layer lays them out. Isometric output re-projects each tile to a floor and ignores height.
 */
export function assembleTerrainTileset(spec: Pick<TilesetSpec, 'name' | 'projection' | 'scheme'> & { tileSize: number }, cut: TerrainTiles): AssembledTerrainMap {
  const size = spec.tileSize;
  const iso = spec.projection === 'isometric';
  const tiles = cut.tiles.map((t, id) => ({ id, collision: t.collision, image: iso ? isoFloor(t.image) : t.image, ...(iso ? { isoKind: 'floor' as const } : {}) }));
  const cell = iso ? isoCellSize(size) : { width: size, height: size };
  // A tileset image is at most 64 tiles across: a wide terrain stays a sensible texture size.
  const sheet = stackTiles(tiles, cell.width, cell.height, Math.min(64, Math.max(TILESET_COLUMNS, Math.ceil(Math.sqrt(tiles.length)))));
  const tsj = buildTsj({
    name: spec.name,
    tiles,
    tileWidth: cell.width,
    tileHeight: cell.height,
    columns: sheet.columns,
    imageWidth: sheet.image.width,
    imageHeight: sheet.image.height,
    scheme: spec.scheme,
    baseTile: {},
    sets: [],
    ...(iso ? { isometric: { gridWidth: size * 2, gridHeight: size } } : {}),
  });
  const tmj = buildTmj({
    orientation: iso ? 'isometric' : 'orthogonal',
    width: cut.cols,
    height: cut.rows,
    tileWidth: iso ? size * 2 : size,
    tileHeight: iso ? size : size,
    tileset: tsj,
    layers: [{ name: 'ground', data: cut.grid }],
  });
  return { sheet: sheet.image, tsj, tmj, tileCount: tiles.length };
}
