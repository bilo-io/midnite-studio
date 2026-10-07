import { describe, expect, it } from 'vitest';

import { cellOrigin, collisionAt, collisionLayer, mapPixelSize, readTmj, sourceRect, stepZoom, tileOf, type TmjTileLayer } from './map-view';

const map = readTmj({
  type: 'map',
  orientation: 'isometric',
  width: 4,
  height: 3,
  tilewidth: 32,
  tileheight: 16,
  layers: [
    { type: 'tilelayer', name: 'ground', width: 4, height: 3, data: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { type: 'imagelayer', name: 'skipped' },
    { type: 'objectgroup', name: 'objects', objects: [] },
  ],
  tilesets: [
    { firstgid: 10, name: 'b', image: 'b.png', tilewidth: 32, tileheight: 24, columns: 2, margin: 1, spacing: 2, tiles: [{ id: 1, properties: [{ name: 'collision', value: 'water' }] }] },
    { firstgid: 1, name: 'a', image: 'a.png', tilewidth: 32, tileheight: 24, columns: 8, tiles: [{ id: 1, properties: [{ name: 'collision', value: 'solid' }] }] },
    { firstgid: 20, source: 'external.tsj' },
  ],
})!;

describe('map view', () => {
  it('reads tile and object layers, skips the rest, and orders tilesets by firstgid', () => {
    expect(map.layers.map((l) => l.name)).toEqual(['ground', 'objects']);
    expect(map.tilesets.map((t) => t.name)).toEqual(['a', 'b']);
    expect(readTmj({ type: 'tileset' })).toBeNull();
  });

  it('finds the tileset of a gid, flip bits masked off', () => {
    expect(tileOf(map.tilesets, 0)).toBeNull();
    expect(tileOf(map.tilesets, 9)).toMatchObject({ tileset: { name: 'a' }, local: 8 });
    expect(tileOf(map.tilesets, (11 | 0x80000000) >>> 0)).toMatchObject({ tileset: { name: 'b' }, local: 1 });
    expect(sourceRect(map.tilesets[1]!, 3)).toEqual({ x: 1 + 34, y: 1 + 26, w: 32, h: 24 });
  });

  it('places isometric cells on the 2:1 diamond grid', () => {
    expect(mapPixelSize(map)).toEqual({ width: 112, height: 56 });
    expect(cellOrigin(map, 0, 0)).toEqual({ x: 32, y: 0 });
    expect(cellOrigin(map, 1, 0)).toEqual({ x: 48, y: 8 });
    expect(cellOrigin(map, 0, 2)).toEqual({ x: 0, y: 16 });
    expect(cellOrigin({ ...map, orientation: 'orthogonal' }, 2, 1)).toEqual({ x: 64, y: 16 });
  });

  it('reads collision from the tile on a cell', () => {
    const layer = collisionLayer(map) as TmjTileLayer;
    expect(layer.name).toBe('ground');
    expect(collisionAt(map, layer, 0)).toBeNull();
    expect(collisionAt(map, layer, 1)).toBe('solid');
  });

  it('steps zoom through whole steps above 1×', () => {
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(0.5);
    expect(stepZoom(8, 1)).toBe(8);
  });
});
