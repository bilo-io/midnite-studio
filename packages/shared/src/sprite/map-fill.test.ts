import { describe, expect, it } from 'vitest';

import { MapSpecSchema, TilesetSpecSchema } from '../media-sprite';
import { BLOB, BLOB47_MASKS, buildTilesetTiles, stackTiles, TILESET_COLUMNS } from './autotile';
import { createRgba } from './image';
import { autotileMap, collisionTileset, decorationSpacing, fillMap, mapLayerSizes, rasteriseMap, scatterDecorations, tilesetIndex } from './map-fill';
import { checkMapSpec, mapSpecIssues } from './map-prompt';
import { buildTsj, TiledMapSchema } from './tiled';

const tilesetSpec = (scheme: 'blob47' | 'corner16' = 'blob47', projection: 'orthogonal' | 'isometric' = 'orthogonal') =>
  TilesetSpecSchema.parse({
    kind: 'tileset',
    name: 'meadow',
    tileSize: 16,
    scheme,
    projection,
    terrains: [
      { id: 'grass', label: 'Grass', collision: 'walkable' },
      { id: 'water', label: 'Water', collision: 'water' },
      { id: 'stone', label: 'Stone', collision: 'solid' },
    ],
    transitions: [{ a: 'grass', b: 'water' }],
  });

function tsjFor(spec: ReturnType<typeof tilesetSpec>) {
  const solid = () => Object.assign(createRgba(16, 16), {});
  const tiles = buildTilesetTiles({
    scheme: spec.scheme,
    tileSize: 16,
    seed: 1,
    soft: false,
    bases: spec.terrains.map((t) => ({ id: t.id, collision: t.collision, image: solid() })),
    transitions: spec.transitions,
  });
  const sheet = stackTiles(tiles, 16, 16, TILESET_COLUMNS);
  return buildTsj({
    name: spec.name,
    tiles,
    tileWidth: 16,
    tileHeight: 16,
    columns: sheet.columns,
    imageWidth: sheet.image.width,
    imageHeight: sheet.image.height,
    scheme: spec.scheme,
    baseTile: { grass: 0, water: 1, stone: 2 },
    sets: [],
  });
}

/** A 5×5 grass map with a 3×3 water island in the middle. */
const island = MapSpecSchema.parse({ width: 8, height: 8, base: 'grass', regions: [{ terrain: 'water', shape: 'rect', points: [[1, 1], [3, 3]] }] });

describe('rasteriseMap', () => {
  it('paints base, regions, rooms, corridors, paths and cells in order', () => {
    const spec = MapSpecSchema.parse({
      width: 10,
      height: 8,
      base: 'stone',
      regions: [{ terrain: 'water', shape: 'ellipse', points: [[7, 5], [1, 1]] }],
      rooms: [{ x: 1, y: 1, w: 3, h: 2 }],
      corridors: [{ from: [2, 2], to: [6, 5], terrain: 'grass' }],
      paths: [{ points: [[0, 7], [3, 7]], terrain: 'water' }],
      cells: [{ x: 9, y: 0, terrain: 'grass' }],
    });
    const grid = rasteriseMap(spec, tilesetSpec().terrains);
    const at = (x: number, y: number) => grid[y * 10 + x];
    expect(at(0, 0)).toBe('stone');
    expect(at(1, 1)).toBe('grass'); // room floor: first walkable that is not the base
    expect(at(5, 2)).toBe('grass'); // corridor along y=2
    expect(at(6, 4)).toBe('grass'); // then down x=6
    expect(at(7, 5)).toBe('water'); // ellipse centre
    expect(at(2, 7)).toBe('water'); // path
    expect(at(9, 0)).toBe('grass'); // cell override
  });
});

describe('autotileMap', () => {
  it('picks the expected blob tile for each cell of a 3×3 island', () => {
    const spec = tilesetSpec();
    const grid = rasteriseMap(island, spec.terrains);
    const ids = autotileMap(grid, 8, 8, spec);
    const { base, sets } = tilesetIndex(spec);
    const first = sets[0]!.first;
    const blob = (mask: number) => first + BLOB47_MASKS.indexOf(mask);
    const { N, E, S, W, NE, SE, SW, NW } = BLOB;
    const expected = [
      [blob(E | S | SE), blob(E | S | W | SE | SW), blob(S | W | SW)],
      [blob(N | E | S | NE | SE), base.water!, blob(N | S | W | NW | SW)],
      [blob(N | E | NE), blob(N | E | W | NE | NW), blob(N | W | NW)],
    ];
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) expect(ids[(y + 1) * 8 + x + 1], `${x},${y}`).toBe(expected[y]![x]);
    // The grass around it is plain grass: it is the `a` side of the transition.
    expect(ids[0]).toBe(base.grass);
    expect(ids[4 * 8 + 4]).toBe(base.grass);
  });

  it('uses corner configs for a corner16 tileset', () => {
    const spec = tilesetSpec('corner16');
    const ids = autotileMap(rasteriseMap(island, spec.terrains), 8, 8, spec);
    const first = tilesetIndex(spec).sets[0]!.first;
    expect(ids[1 * 8 + 1]).toBe(first + 4); // NW water cell: only its SE corner is all water
    expect(ids[2 * 8 + 2]).toBe(tilesetIndex(spec).base.water);
  });

  it('a terrain with no transition is its base tile', () => {
    const spec = tilesetSpec();
    const grid = rasteriseMap(MapSpecSchema.parse({ width: 8, height: 8, base: 'grass', regions: [{ terrain: 'stone', shape: 'rect', points: [[2, 2], [3, 3]] }] }), spec.terrains);
    expect(autotileMap(grid, 8, 8, spec)[2 * 8 + 2]).toBe(2);
  });
});

describe('fillMap', () => {
  it('writes four layers, embeds every tileset and derives collision from tile flags', () => {
    const spec = tilesetSpec();
    const tsj = tsjFor(spec);
    const map = MapSpecSchema.parse({ ...island, regions: [...island.regions, { terrain: 'stone', shape: 'rect', points: [[6, 6], [7, 7]] }], objects: [{ type: 'spawn', name: 'player', x: 5, y: 1 }] });
    const filled = fillMap(map, { spec, tsj }, 1);
    const tmj = TiledMapSchema.parse(filled.tmj);
    expect(tmj.layers.map((l) => l.name)).toEqual(['ground', 'decoration', 'collision', 'objects']);
    expect(tmj.tilesets.every((t) => 'image' in t && !('source' in t))).toBe(true);
    expect(tmj.tilesets.map((t) => t.firstgid)).toEqual([1, 1 + tsj.tilecount]);
    const collision = tmj.layers[2]!;
    if (collision.type !== 'tilelayer') throw new Error('collision is a tile layer');
    expect(collision.visible).toBe(false);
    const collisionGid = 1 + tsj.tilecount;
    expect(collision.data[0]).toBe(0); // grass
    expect(collision.data[2 * 8 + 2]).toBe(collisionGid + 1); // water
    expect(collision.data[7 * 8 + 7]).toBe(collisionGid); // stone = solid
    const objects = tmj.layers[3]!;
    if (objects.type !== 'objectgroup') throw new Error('objects is an object group');
    expect(objects.objects[0]).toMatchObject({ name: 'player', type: 'spawn', x: 5.5 * 16, y: 1.5 * 16, point: true });
    expect(mapLayerSizes(tmj)[3]).toEqual({ name: 'objects', type: 'objectgroup', objects: 1 });
    expect(collisionTileset(16, 16).tiles!.map((t) => t.properties[0]!.value)).toEqual(['solid', 'water']);
  });

  it('an isometric tileset makes an isometric map with 2:1 cells', () => {
    const spec = tilesetSpec('blob47', 'isometric');
    const filled = fillMap(island, { spec, tsj: tsjFor(spec) }, 1);
    expect(filled.tmj).toMatchObject({ orientation: 'isometric', tilewidth: 32, tileheight: 16 });
  });

  it('scatters decorations only on walkable cells, spaced apart, never on an object', () => {
    const spec = tilesetSpec();
    const props = { ...collisionTileset(16, 16), name: 'props', tilecount: 3 };
    const map = MapSpecSchema.parse({ ...island, objects: [{ type: 'exit', name: 'door', x: 6, y: 6 }] });
    const filled = fillMap(map, { spec, tsj: tsjFor(spec) }, 7, { tsj: props, density: 1 });
    const placed = [...filled.decoration.entries()].filter(([, p]) => p >= 0).map(([i]) => i);
    expect(placed.length).toBeGreaterThan(0);
    for (const i of placed) expect(filled.collision[i]).toBe('walkable');
    expect(placed).not.toContain(6 * 8 + 6);
    const r = decorationSpacing(1);
    for (const a of placed) for (const b of placed) if (a !== b) expect(Math.max(Math.abs((a % 8) - (b % 8)), Math.abs(Math.floor(a / 8) - Math.floor(b / 8)))).toBeGreaterThanOrEqual(r);
    expect(scatterDecorations({ width: 8, height: 8, walkable: () => true, props: 3, density: 0.5, seed: 7 })).toEqual(scatterDecorations({ width: 8, height: 8, walkable: () => true, props: 3, density: 0.5, seed: 7 }));
  });
});

describe('map spec checks', () => {
  const terrains = tilesetSpec().terrains;
  it('names an unknown terrain with the tileset’s ids', () => {
    const spec = MapSpecSchema.parse({ ...island, regions: [...island.regions, island.regions[0]!, { terrain: 'lava', shape: 'rect', points: [[0, 0], [1, 1]] }] });
    expect(mapSpecIssues(spec, terrains)).toEqual([{ path: 'regions[2].terrain', message: '"lava" is not in this tileset (grass, water, stone)' }]);
  });
  it('reports zod issues as paths', () => {
    const out = checkMapSpec({ width: 4, height: 8, base: 'grass' }, terrains);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues[0]!.path).toBe('width');
  });
  it('flags objects off the map and wrong point counts', () => {
    const spec = MapSpecSchema.parse({ ...island, regions: [{ terrain: 'water', shape: 'polygon', points: [[0, 0], [1, 1]] }], objects: [{ type: 'spawn', name: 'p', x: 9, y: 0 }] });
    expect(mapSpecIssues(spec, terrains).map((i) => i.path)).toEqual(['regions[0].points', 'objects[0]']);
  });
});
