import { describe, expect, it } from 'vitest';

import type { TilesetTile } from './autotile';
import { createRgba, type RgbaImage } from './image';
import { diamondPoint, ISO_SHADE, isoBlock, isoBlockHeight, isoCellSize, isoFloor, isoTilesetTiles, toDiamond } from './iso';

const paint = (size: number, f: (x: number, y: number) => [number, number, number]): RgbaImage => {
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) img.data.set([...f(x, y), 255], (y * size + x) * 4);
  return img;
};
const alphaAt = (img: RgbaImage, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;

describe('toDiamond', () => {
  it('is twice as wide as it is tall', () => {
    const d = toDiamond(paint(32, () => [10, 20, 30]));
    expect([d.width, d.height]).toEqual([64, 32]);
  });

  it('maps the corners onto the four vertices', () => {
    expect(diamondPoint(0, 0, 32)).toEqual([0, 16]);
    expect(diamondPoint(32, 0, 32)).toEqual([32, 0]);
    expect(diamondPoint(32, 32, 32)).toEqual([64, 16]);
    expect(diamondPoint(0, 32, 32)).toEqual([32, 32]);
  });

  it('puts the top-left corner colour at the left vertex', () => {
    const tile = paint(32, (x, y) => (x < 4 && y < 4 ? [255, 0, 0] : [0, 0, 255]));
    const d = toDiamond(tile);
    const near = (x: number, y: number) => d.data[(y * d.width + x) * 4]!;
    // red next to the left vertex (0, 16), blue next to the top vertex (32, 0)
    expect(near(2, 15)).toBeGreaterThan(200);
    expect(near(32, 1)).toBeLessThan(60);
  });

  it('is transparent outside the diamond and opaque inside', () => {
    const d = toDiamond(paint(32, () => [9, 9, 9]));
    expect(alphaAt(d, 0, 0)).toBe(0);
    expect(alphaAt(d, 63, 31)).toBe(0);
    expect(alphaAt(d, 32, 16)).toBe(255);
    const opaque = Array.from(d.data).filter((_, i) => i % 4 === 3 && d.data[i] === 255).length;
    expect(opaque / (64 * 32)).toBeGreaterThan(0.45);
    expect(opaque / (64 * 32)).toBeLessThan(0.55);
  });

  it('keeps a flat colour flat', () => {
    const d = toDiamond(paint(16, () => [100, 150, 200]));
    expect(Array.from(d.data.slice((8 * 32 + 16) * 4, (8 * 32 + 16) * 4 + 4))).toEqual([100, 150, 200, 255]);
  });
});

describe('iso cells', () => {
  const tile = paint(32, () => [200, 200, 200]);

  it('sizes a cell as the diamond plus the faces', () => {
    expect(isoBlockHeight(32)).toBe(16);
    expect(isoCellSize(32)).toEqual({ width: 64, height: 48 });
  });

  it('draws a floor at the bottom of its cell', () => {
    const floor = isoFloor(tile);
    expect([floor.width, floor.height]).toEqual([64, 48]);
    expect(alphaAt(floor, 32, 2)).toBe(0);
    expect(alphaAt(floor, 32, 47 - 16)).toBe(255);
  });

  it('draws a block with a bright top and darker left and right faces', () => {
    const block = isoBlock(tile);
    const red = (x: number, y: number) => block.data[(y * block.width + x) * 4]!;
    expect(red(32, 8)).toBe(200);
    expect(red(16, 30)).toBe(Math.round(200 * (1 - ISO_SHADE.left)));
    expect(red(48, 30)).toBe(Math.round(200 * (1 - ISO_SHADE.right)));
    expect(red(16, 30)).toBeGreaterThan(red(48, 30));
  });

  it('turns an ortho tileset into floors under the same ids plus a block per terrain', () => {
    const base = (id: number, terrain: string): TilesetTile => ({ id, kind: 'base', terrain, collision: 'walkable', image: tile });
    const transition: TilesetTile = { id: 2, kind: 'transition', a: 'g', b: 'd', config: 0, collision: 'walkable', image: tile };
    const out = isoTilesetTiles([base(0, 'g'), base(1, 'd'), transition]);
    expect(out.map((t) => [t.id, t.kind])).toEqual([[0, 'floor'], [1, 'floor'], [2, 'floor'], [3, 'block'], [4, 'block']]);
    expect(out[3]!.image.height).toBe(48);
  });
});
