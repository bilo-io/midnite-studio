import { describe, expect, it } from 'vitest';

import { buildTilesetTiles, schemeConfigs, TILESET_COLUMNS, stackTiles } from './autotile';
import { createRgba } from './image';
import { buildTmj, buildTsj, embedTileset, TiledMapSchema, TiledTilesetSchema } from './tiled';

const solid = () => {
  const img = createRgba(16, 16);
  img.data.fill(255);
  return img;
};

function tileset(scheme: 'blob47' | 'corner16') {
  const bases = [
    { id: 'grass', collision: 'walkable' as const, image: solid() },
    { id: 'water', collision: 'water' as const, image: solid() },
  ];
  const tiles = buildTilesetTiles({ scheme, tileSize: 16, seed: 1, soft: false, bases, transitions: [{ a: 'grass', b: 'water' }] });
  const sheet = stackTiles(tiles, 16, TILESET_COLUMNS);
  const tsj = buildTsj({
    name: 'meadow',
    tiles,
    tileWidth: 16,
    tileHeight: 16,
    columns: sheet.columns,
    imageWidth: sheet.image.width,
    imageHeight: sheet.image.height,
    scheme,
    baseTile: { grass: 0, water: 1 },
    sets: [{ a: 'grass', b: 'water', tiles: tiles.filter((t) => t.kind === 'transition').map((t) => ({ id: t.id, config: t.config! })) }],
  });
  return { tiles, tsj, sheet };
}

describe('tileset .tsj', () => {
  it('validates against the Tiled 1.10 schema', () => {
    for (const scheme of ['blob47', 'corner16'] as const) expect(() => TiledTilesetSchema.parse(tileset(scheme).tsj)).not.toThrow();
  });

  it('has the fields Tiled and Phaser read', () => {
    const { tsj, sheet } = tileset('blob47');
    expect(tsj).toMatchObject({ type: 'tileset', version: '1.10', name: 'meadow', image: 'tileset.png', margin: 0, spacing: 0, tilewidth: 16, tileheight: 16, tilecount: 2 + 47 });
    expect(tsj.columns).toBe(8);
    expect(tsj.imagewidth).toBe(sheet.image.width);
    expect(tsj.imageheight).toBe(sheet.image.height);
  });

  it('writes collision as a string property on every tile', () => {
    const { tsj } = tileset('blob47');
    expect(tsj.tiles).toHaveLength(49);
    expect(tsj.tiles![1]!.properties).toEqual([{ name: 'collision', type: 'string', value: 'water' }]);
    expect(tsj.tiles![0]!.properties[0]!.value).toBe('walkable');
  });

  it('writes a mixed wangset for blob47 and a corner one for corner16', () => {
    const blob = tileset('blob47').tsj.wangsets![0]!;
    expect(blob).toMatchObject({ name: 'grass-water', type: 'mixed', tile: -1 });
    expect(blob.wangtiles).toHaveLength(47);
    expect(blob.colors.map((c) => c.name)).toEqual(['grass', 'water']);
    expect(blob.colors.map((c) => c.tile)).toEqual([0, 1]);
    const corner = tileset('corner16').tsj.wangsets![0]!;
    expect(corner.type).toBe('corner');
    expect(corner.wangtiles).toHaveLength(16);
    expect(corner.wangtiles.every((w) => w.wangid[0] === 0 && w.wangid[2] === 0)).toBe(true);
  });

  it('names every wang tile a tile the tileset has', () => {
    const { tsj } = tileset('blob47');
    for (const w of tsj.wangsets![0]!.wangtiles) expect(w.tileid).toBeLessThan(tsj.tilecount);
    expect(schemeConfigs('blob47')).toHaveLength(47);
  });

  it('rejects a tileset missing its image', () => {
    const { tsj } = tileset('blob47');
    expect(TiledTilesetSchema.safeParse({ ...tsj, image: undefined }).success).toBe(false);
  });
});

describe('map .tmj', () => {
  it('embeds its tileset and writes gids one past the tile ids', () => {
    const { tsj } = tileset('blob47');
    const map = buildTmj({ orientation: 'orthogonal', width: 3, height: 2, tileWidth: 16, tileHeight: 16, tileset: tsj, layers: [{ name: 'ground', data: [0, 1, 2, 3, 4, 5] }] });
    expect(() => TiledMapSchema.parse(map)).not.toThrow();
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0]).toMatchObject({ firstgid: 1, image: 'tileset.png' });
    expect('source' in map.tilesets[0]!).toBe(false);
    const layer = map.layers[0]!;
    expect(layer.type === 'tilelayer' && layer.data).toEqual([1, 2, 3, 4, 5, 6]);
    expect(map).toMatchObject({ type: 'map', orientation: 'orthogonal', infinite: false, renderorder: 'right-down' });
  });

  it('adds an objects layer when there are objects', () => {
    const { tsj } = tileset('corner16');
    const map = buildTmj({ orientation: 'isometric', width: 1, height: 1, tileWidth: 32, tileHeight: 16, tileset: tsj, layers: [{ name: 'ground', data: [0] }], objects: [{ name: 'start', type: 'spawn', x: 1, y: 2 }] });
    expect(() => TiledMapSchema.parse(map)).not.toThrow();
    expect(map.layers.at(-1)).toMatchObject({ type: 'objectgroup', name: 'objects' });
  });

  it('embedTileset drops the file-level fields', () => {
    const { tsj } = tileset('blob47');
    const e = embedTileset(tsj, 5);
    expect(e.firstgid).toBe(5);
    expect('type' in e).toBe(false);
  });
});
