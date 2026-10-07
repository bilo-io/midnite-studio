import { describe, expect, it } from 'vitest';

import { TilesetSpecSchema } from '../media-sprite';
import type { TilesetBase } from './autotile';
import { createRgba } from './image';
import { backgroundLayerPrompt, propPrompt, tileablePrompt } from './env-prompts';
import { terrainToTiles } from './terrain-tiles';
import { assembleTerrainTileset, assembleTileset, tilesetBlocker, tilesetTileCount } from './tileset';
import { TiledMapSchema, TiledTilesetSchema } from './tiled';

const solid = (r: number, size: number) => {
  const img = createRgba(size, size);
  for (let i = 0; i < size * size; i += 1) img.data.set([r, 100, 50, 255], i * 4);
  return img;
};

const spec = TilesetSpecSchema.parse({ kind: 'tileset', name: 'meadow', tileSize: 16, style: 'pixel' });
const bases = (size: number): TilesetBase[] => [
  { id: 'grass', collision: 'walkable', image: solid(40, size) },
  { id: 'dirt', collision: 'solid', image: solid(200, size) },
];

describe('assembleTileset', () => {
  it('packs the bases and a 47-tile set into an eight-wide sheet', () => {
    const out = assembleTileset(spec, bases(16));
    expect(out.tiles).toHaveLength(49);
    expect(out.sheet.width).toBe(8 * 16);
    expect(out.sheet.height).toBe(7 * 16);
    expect(() => TiledTilesetSchema.parse(out.tsj)).not.toThrow();
    expect(tilesetTileCount(spec)).toBe(49);
  });

  it('builds a 16-tile corner set', () => {
    const out = assembleTileset({ ...spec, scheme: 'corner16' }, bases(16));
    expect(out.tiles).toHaveLength(2 + 16);
    expect(out.tsj.wangsets![0]!.type).toBe('corner');
  });

  it('makes an isometric tileset of diamond floors and blocks, each tagged with its kind', () => {
    const iso = { ...spec, projection: 'isometric' as const };
    const out = assembleTileset(iso, bases(16));
    expect(out.tiles).toHaveLength(49 + 2);
    expect(out.cell).toEqual({ width: 32, height: 24 });
    expect(out.tsj).toMatchObject({ tilewidth: 32, tileheight: 24, grid: { orientation: 'isometric', width: 32, height: 16 } });
    const kind = (id: number) => out.tsj.tiles![id]!.properties.find((p) => p.name === 'kind')?.value;
    expect(kind(0)).toBe('floor');
    expect(kind(48)).toBe('floor');
    expect(kind(49)).toBe('block');
    expect(kind(50)).toBe('block');
    expect(tilesetTileCount(iso)).toBe(51);
    expect(out.tsj.wangsets![0]!.wangtiles).toHaveLength(47);
  });
});

describe('tilesetBlocker', () => {
  it('passes the default spec', () => {
    expect(tilesetBlocker(spec)).toBeNull();
  });

  it('names a transition to a missing terrain', () => {
    expect(tilesetBlocker({ ...spec, transitions: [{ a: 'grass', b: 'lava' }] })).toMatch(/lava/);
  });

  it('refuses a self transition and duplicate ids', () => {
    expect(tilesetBlocker({ ...spec, transitions: [{ a: 'grass', b: 'grass' }] })).toMatch(/two different/);
    expect(tilesetBlocker({ ...spec, terrains: [spec.terrains[0]!, spec.terrains[0]!] })).toMatch(/called grass/);
  });

  it('is skipped for a terrain-sourced tileset', () => {
    expect(tilesetBlocker({ ...spec, terrains: [spec.terrains[0]!], fromTerrain: { project: 'p', terrain: 't', metresPerTile: 4 } })).toBeNull();
  });
});

describe('spec schema', () => {
  it('accepts a bare terrain name from an older spec', () => {
    const parsed = TilesetSpecSchema.parse({ kind: 'tileset', name: 'x', terrains: ['grass', 'dirt'] });
    expect(parsed.terrains[0]).toMatchObject({ id: 'grass', label: 'grass', collision: 'walkable' });
  });

  it('defaults to a 32 px blob47 set', () => {
    expect(TilesetSpecSchema.parse({ kind: 'tileset', name: 'x' })).toMatchObject({ tileSize: 32, scheme: 'blob47', projection: 'orthogonal', seed: 1 });
  });

  it('rejects a tile size that is not 16, 32, 48 or 64', () => {
    expect(TilesetSpecSchema.safeParse({ kind: 'tileset', name: 'x', tileSize: 40 }).success).toBe(false);
  });
});

describe('assembleTerrainTileset', () => {
  const drape = createRgba(32, 32);
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) drape.data.set([x < 16 ? 30 : 220, 120, 60, 255], (y * 32 + x) * 4);

  it('writes a tileset and an embedded-tileset map of the grid', () => {
    const cut = terrainToTiles(drape, 4, 4, 8);
    const out = assembleTerrainTileset({ name: 'isle', tileSize: 8, projection: 'orthogonal', scheme: 'blob47' }, cut);
    expect(out.tileCount).toBe(2);
    expect(() => TiledMapSchema.parse(out.tmj)).not.toThrow();
    expect(out.tmj).toMatchObject({ width: 4, height: 4, tilewidth: 8, orientation: 'orthogonal' });
    const ground = out.tmj.layers[0]!;
    expect(ground.type === 'tilelayer' && ground.data).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2]);
  });

  it('re-projects to diamond floors for isometric', () => {
    const cut = terrainToTiles(drape, 4, 4, 8);
    const out = assembleTerrainTileset({ name: 'isle', tileSize: 8, projection: 'isometric', scheme: 'blob47' }, cut);
    expect(out.tmj).toMatchObject({ orientation: 'isometric', tilewidth: 16, tileheight: 8 });
    expect(out.tsj.tilewidth).toBe(16);
  });
});

describe('environment prompts', () => {
  it('asks for a seamless top-down tile', () => {
    const p = tileablePrompt({ style: 'pixel', prompt: 'a forest clearing' }, { label: 'Grass', prompt: 'lush grass' });
    expect(p).toMatch(/seamless, tileable, top-down/);
    expect(p).toMatch(/lush grass/);
    expect(p).toMatch(/forest clearing/);
  });

  it('asks a transparent layer for a chroma background and an opaque one for none', () => {
    const spec = { style: 'flat' as const, prompt: '' };
    expect(backgroundLayerPrompt(spec, { name: 'near', prompt: 'bushes' }, { opaque: false, chroma: '#ff00ff' })).toMatch(/magenta/);
    expect(backgroundLayerPrompt(spec, { name: 'sky', prompt: 'clouds' }, { opaque: true })).not.toMatch(/magenta/);
  });

  it('draws one prop', () => {
    expect(propPrompt({ style: 'pixel', prompt: '' }, { name: 'crate', prompt: 'wooden crate' }, { chroma: '#00ff00' })).toMatch(/wooden crate/);
  });
});
