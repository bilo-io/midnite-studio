import { describe, expect, it } from 'vitest';

import { createRgba, type RgbaImage } from './image';
import { TERRAIN_CLASS_INDICES } from '../terrain/classes';
import { terrainGridBlocker, terrainTileGrid, terrainToTiles, terrainUniqueBlocker, TERRAIN_TILES_MAX_UNIQUE } from './terrain-tiles';

const checker = (size: number, cell: number): RgbaImage => {
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      img.data.set(on ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * size + x) * 4);
    }
  return img;
};

describe('terrain tile grid', () => {
  it('a 1024 m terrain at 4 m per tile is 256 × 256', () => {
    expect(terrainTileGrid(1024, 4)).toBe(256);
    expect(terrainGridBlocker(1024, 4)).toBeNull();
  });

  it('refuses a grid over 256 × 256', () => {
    expect(terrainGridBlocker(1024, 2)).toMatch(/512 × 512/);
    expect(terrainGridBlocker(65_536, 16)).toMatch(/4096/);
  });

  it('rounds to whole tiles and never reaches zero', () => {
    expect(terrainTileGrid(1000, 4)).toBe(250);
    expect(terrainTileGrid(2, 16)).toBe(1);
  });
});

describe('terrainToTiles', () => {
  it('cuts the image into the grid and dedupes identical cells', () => {
    const out = terrainToTiles(checker(64, 16), 4, 4, 16);
    expect(out.grid).toHaveLength(16);
    expect(out.tiles).toHaveLength(2);
    expect(Array.from(out.grid.slice(0, 4))).toEqual([0, 1, 0, 1]);
    expect(Array.from(out.grid.slice(4, 8))).toEqual([1, 0, 1, 0]);
  });

  it('keeps every cell distinct when none repeat', () => {
    const img = createRgba(8, 8);
    for (let i = 0; i < 64; i += 1) img.data.set([i * 4, 0, 0, 255], i * 4);
    expect(terrainToTiles(img, 2, 2, 4).tiles).toHaveLength(4);
  });

  it('derives collision from the dominant land cover', () => {
    const res = 8;
    const classes = new Uint8Array(res * res).fill(TERRAIN_CLASS_INDICES.grass);
    for (let y = 0; y < res; y += 1) for (let x = 0; x < 4; x += 1) classes[y * res + x] = TERRAIN_CLASS_INDICES.water;
    for (let y = 4; y < res; y += 1) for (let x = 4; x < res; x += 1) classes[y * res + x] = TERRAIN_CLASS_INDICES.building;
    const flat = createRgba(16, 16);
    flat.data.fill(200);
    const out = terrainToTiles(flat, 2, 2, 8, { classes, res });
    const at = (c: number, r: number) => out.tiles[out.grid[r * 2 + c]!]!.collision;
    expect(at(0, 0)).toBe('water');
    expect(at(1, 0)).toBe('walkable');
    expect(at(1, 1)).toBe('solid');
    // identical pixels with different collision are different tiles
    expect(out.tiles.length).toBe(3);
  });

  it('refuses too many distinct tiles', () => {
    expect(terrainUniqueBlocker(10)).toBeNull();
    expect(terrainUniqueBlocker(TERRAIN_TILES_MAX_UNIQUE + 1)).toMatch(/distinct tiles/);
  });
});
