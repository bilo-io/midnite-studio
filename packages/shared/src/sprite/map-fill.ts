import type { MapSpec, TilesetCollision, TilesetSpec } from '../media-sprite';
import { BLOB, BLOB47_MASKS, CORNER, reduceBlob, restrictiveCollision, schemeConfigs } from './autotile';
import { createRgba, type RgbaImage } from './image';
import { embedTileset, TILED_APP_VERSION, TILED_VERSION, type TiledMap, type TiledTileset } from './tiled';

/**
 * Map fill (Phase 106 Theme J): a {@link MapSpec} layout → a terrain grid → autotiled ground → a
 * decoration scatter → a collision layer → a Tiled `.tmj` with every tileset embedded (Phaser cannot
 * load an external `.tsj` — Decision 12). Pure: the caller reads the tileset and writes the files.
 *
 * Tile ids are derived from the tileset spec alone, exactly as `assembleTileset` lays them out: one
 * base per terrain in order, then each transition's full set in `schemeConfigs` order (an isometric
 * tileset keeps those ids for its floors and appends blocks, which a map does not use).
 *
 * Autotiling paints a cell of terrain `t` with the transition set `{a, b: t}` whose `a` is the
 * commonest other terrain around it; the blob mask (or corner config) counts the neighbours that are
 * `t`, and a neighbour off the map counts as `t`. A cell with no such set, or none of its neighbours
 * different, is the plain base tile — so the `a` side of every edge is a base tile, which is what the
 * composited masks were built to meet.
 */
export type MapTileset = Pick<TilesetSpec, 'name' | 'terrains' | 'transitions' | 'scheme' | 'projection' | 'tileSize'>;

export type TilesetIndex = {
  base: Record<string, number>;
  sets: ReadonlyArray<{ a: string; b: string; first: number }>;
  configs: readonly number[];
  /** Collision per tile id. */
  collision: TilesetCollision[];
};

export function tilesetIndex(spec: Pick<MapTileset, 'terrains' | 'transitions' | 'scheme'>): TilesetIndex {
  const base: Record<string, number> = {};
  const collisionOf: Record<string, TilesetCollision> = {};
  const collision: TilesetCollision[] = [];
  spec.terrains.forEach((t, i) => {
    base[t.id] = i;
    collisionOf[t.id] = t.collision;
    collision.push(t.collision);
  });
  const configs = schemeConfigs(spec.scheme);
  const sets = spec.transitions.map((t, i) => ({ a: t.a, b: t.b, first: spec.terrains.length + i * configs.length }));
  for (const set of sets) {
    const c = restrictiveCollision(collisionOf[set.a] ?? 'walkable', collisionOf[set.b] ?? 'walkable');
    for (let i = 0; i < configs.length; i += 1) collision.push(c);
  }
  return { base, sets, configs, collision };
}

// --- rasterise --------------------------------------------------------------------

/** The room floor when a room names none: the first walkable terrain that is not the base. */
export function defaultRoomTerrain(spec: Pick<MapSpec, 'base'>, terrains: ReadonlyArray<{ id: string; collision: TilesetCollision }>): string {
  return terrains.find((t) => t.collision === 'walkable' && t.id !== spec.base)?.id ?? spec.base;
}

function insidePolygon(x: number, y: number, pts: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Terrain id per cell, row-major. Later layers win: base, regions, rooms, corridors, paths, cells. */
export function rasteriseMap(spec: MapSpec, terrains: ReadonlyArray<{ id: string; collision: TilesetCollision }>): string[] {
  const { width: w, height: h } = spec;
  const grid = new Array<string>(w * h).fill(spec.base);
  const set = (x: number, y: number, terrain: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = terrain;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, terrain: string) => {
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(h - 1, Math.max(y0, y1)); y += 1)
      for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(w - 1, Math.max(x0, x1)); x += 1) grid[y * w + x] = terrain;
  };
  for (const region of spec.regions) {
    const pts = region.points;
    if (region.shape === 'rect') rect(pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1], region.terrain);
    else if (region.shape === 'ellipse') {
      const [cx, cy] = pts[0]!;
      const rx = Math.max(0.5, Math.abs(pts[1]![0])), ry = Math.max(0.5, Math.abs(pts[1]![1]));
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) grid[y * w + x] = region.terrain;
    } else if (pts.length >= 3) {
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (insidePolygon(x, y, pts)) grid[y * w + x] = region.terrain;
    }
  }
  const floor = defaultRoomTerrain(spec, terrains);
  for (const room of spec.rooms ?? []) rect(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, room.terrain ?? floor);
  for (const c of spec.corridors ?? []) {
    // An L: along x at the start's row, then along y at the end's column, `width` thick.
    const lo = -Math.floor((c.width - 1) / 2), hi = lo + c.width - 1;
    const [fx, fy] = c.from, [tx, ty] = c.to;
    rect(Math.min(fx, tx), fy + lo, Math.max(fx, tx), fy + hi, c.terrain);
    rect(tx + lo, Math.min(fy, ty), tx + hi, Math.max(fy, ty), c.terrain);
  }
  for (const path of spec.paths ?? [])
    for (let i = 1; i < path.points.length; i += 1) for (const [x, y] of line(path.points[i - 1]!, path.points[i]!)) set(x, y, path.terrain);
  for (const cell of spec.cells ?? []) set(cell.x, cell.y, cell.terrain);
  return grid;
}

/**
 * Bresenham, both ends included, **4-connected**: a diagonal step is taken as two orthogonal ones, so a
 * one-tile path stays one connected strip under autotiling (blob tiles join only across edges).
 */
export function line([x0, y0]: readonly [number, number], [x1, y1]: readonly [number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 8192; guard += 1) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    const stepX = e2 >= dy, stepY = e2 <= dx;
    if (stepX) {
      err += dy;
      x += sx;
    }
    if (stepX && stepY) out.push([x, y]);
    if (stepY) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

// --- autotile ---------------------------------------------------------------------

const NEIGHBOURS: ReadonlyArray<[number, number, number]> = [
  [0, -1, BLOB.N],
  [1, 0, BLOB.E],
  [0, 1, BLOB.S],
  [-1, 0, BLOB.W],
  [1, -1, BLOB.NE],
  [1, 1, BLOB.SE],
  [-1, 1, BLOB.SW],
  [-1, -1, BLOB.NW],
];

/** Tile id per cell (0-based, into the tileset). */
export function autotileMap(grid: readonly string[], width: number, height: number, tileset: Pick<MapTileset, 'terrains' | 'transitions' | 'scheme'>, index = tilesetIndex(tileset)): Int32Array {
  const out = new Int32Array(width * height);
  const at = (x: number, y: number, self: string): string => (x < 0 || y < 0 || x >= width || y >= height ? self : grid[y * width + x]!);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const t = grid[y * width + x]!;
      const baseId = index.base[t] ?? 0;
      // The commonest other terrain around the cell, edges before corners on a tie.
      const counts = new Map<string, number>();
      for (const [dx, dy] of NEIGHBOURS) {
        const n = at(x + dx, y + dy, t);
        if (n !== t) counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      const others = [...counts.entries()].sort((p, q) => q[1] - p[1]).map(([id]) => id);
      const set = others.map((a) => index.sets.find((s) => s.b === t && s.a === a)).find((s) => s !== undefined);
      if (!set) {
        out[y * width + x] = baseId;
        continue;
      }
      if (tileset.scheme === 'blob47') {
        let mask = 0;
        for (const [dx, dy, bit] of NEIGHBOURS) if (at(x + dx, y + dy, t) === t) mask |= bit;
        const reduced = reduceBlob(mask);
        out[y * width + x] = reduced === 255 ? baseId : set.first + BLOB47_MASKS.indexOf(reduced);
      } else {
        const same = (dx: number, dy: number) => at(x + dx, y + dy, t) === t;
        let config = 0;
        if (same(-1, -1) && same(0, -1) && same(-1, 0)) config |= CORNER.NW;
        if (same(1, -1) && same(0, -1) && same(1, 0)) config |= CORNER.NE;
        if (same(1, 1) && same(0, 1) && same(1, 0)) config |= CORNER.SE;
        if (same(-1, 1) && same(0, 1) && same(-1, 0)) config |= CORNER.SW;
        out[y * width + x] = config === 15 ? baseId : set.first + config;
      }
    }
  return out;
}

// --- decorations --------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The spacing, in cells, decorations keep from each other at a density (1 → 2 cells, 0.1 → ~6). */
export const decorationSpacing = (density: number): number => Math.max(1, Math.round(2 / Math.sqrt(Math.max(0.01, density))));

/**
 * Seeded Poisson-disk scatter over walkable cells: cells are visited in a seeded order and one is kept
 * when no kept cell is within the spacing (Chebyshev distance). `-1` = nothing, else a prop index.
 */
export function scatterDecorations(opts: { width: number; height: number; walkable: (i: number) => boolean; props: number; density: number; seed: number; avoid?: ReadonlySet<number> }): Int32Array {
  const { width: w, height: h } = opts;
  const out = new Int32Array(w * h).fill(-1);
  if (opts.props <= 0 || opts.density <= 0) return out;
  const rnd = mulberry32(opts.seed ^ 0x5bd1e995);
  const order = Array.from({ length: w * h }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const r = decorationSpacing(opts.density);
  const kept: number[] = [];
  for (const i of order) {
    if (!opts.walkable(i) || opts.avoid?.has(i)) continue;
    const x = i % w, y = Math.floor(i / w);
    if (kept.some((k) => Math.max(Math.abs((k % w) - x), Math.abs(Math.floor(k / w) - y)) < r)) continue;
    kept.push(i);
    out[i] = Math.floor(rnd() * opts.props);
  }
  return out;
}

// --- tilesets a map adds -----------------------------------------------------------------

export const MAP_COLLISION_IMAGE = 'collision.png';
export const MAP_PROPS_IMAGE = 'props.png';
/** The collision tileset's tiles, in id order. Walkable cells are empty. */
export const MAP_COLLISION_TILES = ['solid', 'water'] as const;

/** Two tiles, 40 % red (`solid`) and 40 % blue (`water`) — what Tiled shows when the layer is turned on. */
export function collisionTilesImage(tileWidth: number, tileHeight: number): RgbaImage {
  const img = createRgba(tileWidth * 2, tileHeight);
  for (let y = 0; y < tileHeight; y += 1)
    for (let x = 0; x < tileWidth * 2; x += 1) img.data.set(x < tileWidth ? [229, 57, 53, 102] : [30, 136, 229, 102], (y * img.width + x) * 4);
  return img;
}

export function collisionTileset(tileWidth: number, tileHeight: number): TiledTileset {
  return {
    type: 'tileset',
    version: TILED_VERSION,
    tiledversion: TILED_APP_VERSION,
    name: 'collision',
    tilewidth: tileWidth,
    tileheight: tileHeight,
    tilecount: MAP_COLLISION_TILES.length,
    columns: MAP_COLLISION_TILES.length,
    image: MAP_COLLISION_IMAGE,
    imagewidth: tileWidth * MAP_COLLISION_TILES.length,
    imageheight: tileHeight,
    margin: 0,
    spacing: 0,
    tiles: MAP_COLLISION_TILES.map((c, id) => ({ id, properties: [{ name: 'collision', type: 'string' as const, value: c }] })),
  };
}

/** A prop sheet's cells (`props.png`, row-major, `columns` across) as a tileset; each tile names its prop. */
export function propsTileset(props: readonly string[], cell: readonly [number, number], columns: number, image: { width: number; height: number }): TiledTileset {
  return {
    type: 'tileset',
    version: TILED_VERSION,
    tiledversion: TILED_APP_VERSION,
    name: 'props',
    tilewidth: cell[0],
    tileheight: cell[1],
    tilecount: props.length,
    columns,
    image: MAP_PROPS_IMAGE,
    imagewidth: image.width,
    imageheight: image.height,
    margin: 0,
    spacing: 0,
    tiles: props.map((name, id) => ({ id, properties: [{ name: 'prop', type: 'string' as const, value: name }] })),
  };
}

// --- fill --------------------------------------------------------------------------------

export type FilledMap = {
  tmj: TiledMap;
  /** Terrain per cell. */
  grid: string[];
  ground: Int32Array;
  decoration: Int32Array;
  collision: TilesetCollision[];
  tileWidth: number;
  tileHeight: number;
};

/** The pixel size of one map cell: the tile size, or `2s × s` on an isometric grid. */
export const mapCellSize = (tileset: Pick<MapTileset, 'projection' | 'tileSize'>): { width: number; height: number } =>
  tileset.projection === 'isometric' ? { width: tileset.tileSize * 2, height: tileset.tileSize } : { width: tileset.tileSize, height: tileset.tileSize };

/**
 * The whole fill. The map's orientation follows the tileset's projection (an orthogonal tileset cannot
 * draw an isometric map). Layers: `ground`, `decoration`, `collision` (hidden, one tile per flag) and
 * `objects` — always all four, so a game can address them by name.
 */
export function fillMap(
  spec: MapSpec,
  tileset: { spec: MapTileset; tsj: TiledTileset },
  seed: number,
  decorations?: { tsj: TiledTileset; density: number },
): FilledMap {
  const { width: w, height: h } = spec;
  const index = tilesetIndex(tileset.spec);
  const grid = rasteriseMap(spec, tileset.spec.terrains);
  const ground = autotileMap(grid, w, h, tileset.spec, index);
  const collision = Array.from(ground, (id) => index.collision[id] ?? 'walkable');
  const objectCells = new Set(spec.objects.filter((o) => o.x >= 0 && o.y >= 0 && o.x < w && o.y < h).map((o) => o.y * w + o.x));
  const decoration = decorations
    ? scatterDecorations({ width: w, height: h, walkable: (i) => collision[i] === 'walkable', props: decorations.tsj.tilecount, density: decorations.density, seed, avoid: objectCells })
    : new Int32Array(w * h).fill(-1);

  const iso = tileset.spec.projection === 'isometric';
  const cell = mapCellSize(tileset.spec);
  const groundTs = embedTileset(tileset.tsj, 1);
  const propsFirst = 1 + tileset.tsj.tilecount;
  const propsTs = decorations ? embedTileset(decorations.tsj, propsFirst) : null;
  const collisionFirst = propsFirst + (decorations?.tsj.tilecount ?? 0);
  const collisionTs = embedTileset(collisionTileset(cell.width, cell.height), collisionFirst);

  const layer = (id: number, name: string, data: number[], visible = true) => ({ id, name, type: 'tilelayer' as const, x: 0, y: 0, width: w, height: h, opacity: 1, visible, data });
  const objects = spec.objects.map((o, i) => ({
    id: i + 1,
    name: o.name,
    type: o.type,
    // Tiled measures isometric objects in tile-height units on both axes.
    x: (o.x + 0.5) * (iso ? cell.height : cell.width),
    y: (o.y + 0.5) * cell.height,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
    point: true,
  }));
  const tmj: TiledMap = {
    type: 'map',
    version: TILED_VERSION,
    tiledversion: TILED_APP_VERSION,
    orientation: iso ? 'isometric' : 'orthogonal',
    renderorder: 'right-down',
    width: w,
    height: h,
    tilewidth: cell.width,
    tileheight: cell.height,
    infinite: false,
    nextlayerid: 5,
    nextobjectid: objects.length + 1,
    layers: [
      layer(1, 'ground', Array.from(ground, (id) => id + 1)),
      layer(2, 'decoration', Array.from(decoration, (p) => (p < 0 ? 0 : propsFirst + p))),
      layer(3, 'collision', collision.map((c) => (c === 'walkable' ? 0 : collisionFirst + MAP_COLLISION_TILES.indexOf(c))), false),
      { id: 4, name: 'objects', type: 'objectgroup' as const, x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown' as const, objects },
    ],
    tilesets: [groundTs, ...(propsTs ? [propsTs] : []), collisionTs],
  };
  return { tmj, grid, ground, decoration, collision, tileWidth: cell.width, tileHeight: cell.height };
}

/** Each layer's size, for `map_get` (never the tile arrays). */
export function mapLayerSizes(tmj: Pick<TiledMap, 'layers'>): Array<{ name: string; type: string; width?: number; height?: number; tiles?: number; objects?: number }> {
  return tmj.layers.map((l) =>
    l.type === 'tilelayer' ? { name: l.name, type: l.type, width: l.width, height: l.height, tiles: l.data.filter((g) => g > 0).length } : { name: l.name, type: l.type, objects: l.objects.length },
  );
}
