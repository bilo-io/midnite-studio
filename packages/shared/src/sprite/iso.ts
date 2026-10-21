import { createRgba, type RgbaImage, type RgbaLike } from './image';
import type { TilesetTile } from './autotile';

/**
 * Isometric tiles (Phase 106 Theme I): a 2:1 diamond floor, and a block with two side faces, made by
 * re-projecting the top-down tiles of Theme H — so the same base tiles, transitions and wangsets serve both.
 *
 * A `size × size` square maps onto a `2·size × size` diamond: the square's top-left corner lands on the
 * diamond's **left** vertex `(0, size/2)`, top-right on the top vertex `(size, 0)`, bottom-right on the
 * right vertex `(2·size, size/2)` and bottom-left on the bottom vertex `(size, size)`. Because that is an
 * affine map of a repeating square, the diamonds tile on the standard 2:1 grid.
 */

/** Where source point `(sx, sy)` of a `size`-square lands on the diamond. */
export const diamondPoint = (sx: number, sy: number, size: number): [number, number] => [sx + sy, size / 2 - (sx - sy) / 2];

function sample(img: RgbaLike, x: number, y: number, out: Uint8ClampedArray, o: number): void {
  const fx = Math.min(img.width - 1, Math.max(0, x - 0.5)), fy = Math.min(img.height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (xx: number, yy: number, c: number) => img.data[(yy * img.width + xx) * 4 + c]!;
  let a = 0, premul = [0, 0, 0];
  for (const [xx, yy, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]] as const) {
    const alpha = at(xx, yy, 3) * w;
    a += alpha;
    premul = [premul[0]! + at(xx, yy, 0) * alpha, premul[1]! + at(xx, yy, 1) * alpha, premul[2]! + at(xx, yy, 2) * alpha];
  }
  out[o + 3] = Math.round(a);
  if (a > 0) for (let c = 0; c < 3; c += 1) out[o + c] = Math.round(premul[c]! / a);
}

/** A square tile as a `2·size × size` diamond (bilinear; pixels outside the diamond are transparent). */
export function toDiamond(tile: RgbaLike): RgbaImage {
  const size = tile.width;
  const out = createRgba(size * 2, size);
  for (let oy = 0; oy < size; oy += 1)
    for (let ox = 0; ox < size * 2; ox += 1) {
      const a = ox + 0.5;
      const b = size - 2 * (oy + 0.5);
      const sx = (a + b) / 2, sy = (a - b) / 2;
      if (sx < 0 || sy < 0 || sx >= size || sy >= tile.height) continue;
      sample(tile, sx, (sy * tile.height) / size, out.data, (oy * out.width + ox) * 4);
    }
  return out;
}

/** The side faces are the base tile darkened by these fractions: left 20 %, right 40 %. */
export const ISO_SHADE = { left: 0.2, right: 0.4 } as const;

/** Height of a block's side faces, in pixels: half the tile size. */
export const isoBlockHeight = (size: number): number => Math.max(1, Math.round(size / 2));

/** A block cell's size: the diamond plus the side faces. */
export const isoCellSize = (size: number): { width: number; height: number } => ({ width: size * 2, height: size + isoBlockHeight(size) });

const blit = (dst: RgbaImage, src: RgbaLike, dx: number, dy: number): void => {
  for (let y = 0; y < src.height; y += 1)
    for (let x = 0; x < src.width; x += 1) {
      const s = (y * src.width + x) * 4;
      if (src.data[s + 3]! === 0) continue;
      const o = ((dy + y) * dst.width + dx + x) * 4;
      for (let c = 0; c < 4; c += 1) dst.data[o + c] = src.data[s + c]!;
    }
};

/** A floor tile in an isometric cell: the diamond sits at the bottom, where Tiled draws a tile's footprint. */
export function isoFloor(tile: RgbaLike): RgbaImage {
  const size = tile.width;
  const cell = isoCellSize(size);
  const out = createRgba(cell.width, cell.height);
  blit(out, toDiamond(tile), 0, cell.height - size);
  return out;
}

/** A block: the diamond top plus the left and right faces, drawn from the same tile, darker. */
export function isoBlock(tile: RgbaLike): RgbaImage {
  const size = tile.width;
  const h = isoBlockHeight(size);
  const cell = isoCellSize(size);
  const out = createRgba(cell.width, cell.height);
  for (let x = 0; x < size * 2; x += 1) {
    const left = x < size;
    const edge = left ? size / 2 + x / 2 : (3 * size - x) / 2;
    const u = (left ? x : x - size) / size;
    const shade = 1 - (left ? ISO_SHADE.left : ISO_SHADE.right);
    for (let y = Math.max(0, Math.ceil(edge - 0.5)); y < Math.min(cell.height, edge + h); y += 1) {
      const v = (y + 0.5 - edge) / h;
      if (v < 0 || v >= 1) continue;
      const o = (y * out.width + x) * 4;
      sample(tile, u * size + 0.5, v * tile.height + 0.5, out.data, o);
      for (let c = 0; c < 3; c += 1) out.data[o + c] = Math.round(out.data[o + c]! * shade);
    }
  }
  blit(out, toDiamond(tile), 0, 0);
  return out;
}

export type IsoTile = Omit<TilesetTile, 'kind'> & { kind: 'floor' | 'block' };

/**
 * An orthogonal tileset's tiles as an isometric one: every tile becomes a floor under its own id, and
 * each terrain's base tile gets a block after them.
 */
export function isoTilesetTiles(tiles: readonly TilesetTile[]): IsoTile[] {
  const floors: IsoTile[] = tiles.map((t) => ({ ...t, kind: 'floor', image: isoFloor(t.image) }));
  const blocks: IsoTile[] = tiles
    .filter((t) => t.kind === 'base')
    .map((t, i) => ({ ...t, id: tiles.length + i, kind: 'block', image: isoBlock(t.image) }));
  return [...floors, ...blocks];
}
