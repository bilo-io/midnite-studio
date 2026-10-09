import type { TilesetCollision, TilesetScheme } from '../media-sprite';
import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Procedural autotile transitions (Phase 106 Theme H). An image model cannot promise 47 matching
 * edges, so transitions are **composited**: two seamless base tiles are blended through an alpha mask,
 * and the masks are built so that tiles which may touch share their edge pixels exactly.
 *
 * ## Blob 47 (Tiled `mixed`)
 * A tile is a cell of the terrain being painted (`b`) over the surrounding one (`a`). Its mask is the
 * standard 8-neighbour bitmask ({@link BLOB}); a corner counts only when both edges beside it are set,
 * which leaves exactly 47 distinct masks ({@link BLOB47_MASKS}).
 *
 * Coverage inside one cell is a bilinear field over its four quadrants. Each quadrant has four control
 * values: the centre (always `b`), the two edge midpoints (that neighbour is `b`) and the vertex (all four
 * cells around it are `b`). The field is a function of those values and of nothing else, so:
 *
 * - an edge beside an `a` neighbour is `a` along its whole length (field 0 there), matching the plain
 *   `a` tile next to it;
 * - an edge between two `b` cells reads the same two vertex values from either side, so both tiles
 *   evaluate the same function of the position along the edge;
 * - the noise that roughens the boundary is **periodic with the tile** — the same value on the left and
 *   right edge, and on the top and bottom — and independent of the configuration, so it too is the same
 *   on both sides of any shared edge.
 *
 * The outermost ring of pixels is sampled *on* the edge rather than half a pixel inside it, which is
 * what makes the touching columns equal byte for byte.
 *
 * ## Corner 16 (Tiled `corner`)
 * Four corner values, `a` or `b`; coverage is their bilinear blend over the whole tile. Two tiles
 * sharing an edge share two corners, hence the edge.
 */
export const BLOB = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

/** Drops the corners whose two neighbouring edges are not both set. */
export function reduceBlob(mask: number): number {
  let m = mask & 0xff;
  if (!(m & BLOB.N && m & BLOB.E)) m &= ~BLOB.NE;
  if (!(m & BLOB.E && m & BLOB.S)) m &= ~BLOB.SE;
  if (!(m & BLOB.S && m & BLOB.W)) m &= ~BLOB.SW;
  if (!(m & BLOB.W && m & BLOB.N)) m &= ~BLOB.NW;
  return m;
}

/** The 47 valid reduced masks, ascending. A tile's index in a blob set is its position here. */
export const BLOB47_MASKS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, m) => reduceBlob(m)))].sort((x, y) => x - y);

/** Corner indexing for the 16-tile set: bit set = that corner is `b`. */
export const CORNER = { NW: 1, NE: 2, SE: 4, SW: 8 } as const;
export const CORNER16: readonly number[] = Array.from({ length: 16 }, (_, i) => i);

export const TILESET_SCHEME_SIZES: Record<TilesetScheme, number> = { blob47: BLOB47_MASKS.length, corner16: CORNER16.length };

/** The configurations of a scheme, in tile order. */
export const schemeConfigs = (scheme: TilesetScheme): readonly number[] => (scheme === 'blob47' ? BLOB47_MASKS : CORNER16);

// --- noise ----------------------------------------------------------------------

/** Lattice cells across one tile; the noise wraps over them. */
export const NOISE_CELLS = 4;
const NOISE_AMPLITUDE = 0.16;
const THRESHOLD = 0.5;
/** Width of the soft edge, in field units, for non-pixel styles. */
const SOFT = 0.1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise in `[-1, 1]`: `noise(0, y) === noise(1, y)` and `noise(x, 0) === noise(x, 1)`. */
export function periodicNoise(seed: number): (px: number, py: number) => number {
  const rnd = mulberry32(seed);
  const lattice = Array.from({ length: NOISE_CELLS * NOISE_CELLS }, () => rnd() * 2 - 1);
  const at = (i: number, j: number) => lattice[(((j % NOISE_CELLS) + NOISE_CELLS) % NOISE_CELLS) * NOISE_CELLS + (((i % NOISE_CELLS) + NOISE_CELLS) % NOISE_CELLS)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (px, py) => {
    const fx = px * NOISE_CELLS, fy = py * NOISE_CELLS;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  };
}

// --- masks ----------------------------------------------------------------------

export type TransitionConfig = { scheme: TilesetScheme; config: number };

/** A pixel index to a position in `[0, 1]`, with the outermost ring placed exactly on the edge. */
const place = (i: number, size: number): number => (i === 0 ? 0 : i === size - 1 ? 1 : (i + 0.5) / size);

/** The coverage field (before noise) of the `blob47` tile `mask` at `(px, py)`. */
function blobField(mask: number, px: number, py: number): number {
  const cx = px - 0.5, cy = py - 0.5;
  const u = Math.abs(cx) * 2, v = Math.abs(cy) * 2;
  const west = cx < 0, north = cy < 0;
  const has = (bit: number) => (mask & bit ? 1 : 0);
  const eH = has(west ? BLOB.W : BLOB.E);
  const eV = has(north ? BLOB.N : BLOB.S);
  const vertex = has(north ? (west ? BLOB.NW : BLOB.NE) : west ? BLOB.SW : BLOB.SE);
  return (1 - u) * (1 - v) + u * (1 - v) * eH + (1 - u) * v * eV + u * v * vertex;
}

function cornerField(config: number, px: number, py: number): number {
  const has = (bit: number) => (config & bit ? 1 : 0);
  return (1 - px) * (1 - py) * has(CORNER.NW) + px * (1 - py) * has(CORNER.NE) + px * py * has(CORNER.SE) + (1 - px) * py * has(CORNER.SW);
}

/**
 * The alpha of `b` over `a`, `size × size`, 0–255. `soft` feathers the boundary; pixel styles pass
 * `false` for a hard 0/255 edge. Edge columns and rows are the same function either way.
 */
export function transitionMask(tile: TransitionConfig, size: number, seed: number, soft = false): Uint8Array {
  const noise = periodicNoise(seed);
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const py = place(y, size);
    for (let x = 0; x < size; x += 1) {
      const px = place(x, size);
      const field = tile.scheme === 'blob47' ? blobField(tile.config, px, py) : cornerField(tile.config, px, py);
      const value = field + noise(px, py) * NOISE_AMPLITUDE - THRESHOLD;
      out[y * size + x] = soft ? Math.round(255 * Math.min(1, Math.max(0, value / SOFT + 0.5))) : value > 0 ? 255 : 0;
    }
  }
  return out;
}

/** `b` over `a` through `mask` (straight alpha, both tiles the mask's size). */
export function compositeTile(a: RgbaLike, b: RgbaLike, mask: Uint8Array): RgbaImage {
  const out = createRgba(a.width, a.height);
  for (let i = 0; i < mask.length; i += 1) {
    const t = mask[i]! / 255;
    for (let c = 0; c < 4; c += 1) out.data[i * 4 + c] = Math.round(a.data[i * 4 + c]! * (1 - t) + b.data[i * 4 + c]! * t);
  }
  return out;
}

/** The `size`-long column or row of `mask` at an edge, for matching tests. */
export function maskEdge(mask: Uint8Array, size: number, edge: 'n' | 'e' | 's' | 'w'): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i += 1) out.push(edge === 'n' ? mask[i]! : edge === 's' ? mask[(size - 1) * size + i]! : edge === 'w' ? mask[i * size]! : mask[i * size + size - 1]!);
  return out;
}

// --- who may touch whom -----------------------------------------------------------

const BIT = BLOB;

/**
 * Whether blob tile `left` may sit directly west of `right`: both must be `b` across the shared edge,
 * and the two corners on it must agree with the cells that are really there.
 */
export function blobFitsEast(left: number, right: number): boolean {
  if (!(left & BIT.E) || !(right & BIT.W)) return false;
  // The vertex above: left's NE corner and right's NW corner are both "all four cells are b".
  const north = Boolean(left & BIT.N && right & BIT.N);
  const south = Boolean(left & BIT.S && right & BIT.S);
  return Boolean(left & BIT.NE) === north && Boolean(right & BIT.NW) === north && Boolean(left & BIT.SE) === south && Boolean(right & BIT.SW) === south;
}

/** Whether blob tile `top` may sit directly north of `bottom`. */
export function blobFitsSouth(top: number, bottom: number): boolean {
  if (!(top & BIT.S) || !(bottom & BIT.N)) return false;
  const west = Boolean(top & BIT.W && bottom & BIT.W);
  const east = Boolean(top & BIT.E && bottom & BIT.E);
  return Boolean(top & BIT.SW) === west && Boolean(bottom & BIT.NW) === west && Boolean(top & BIT.SE) === east && Boolean(bottom & BIT.NE) === east;
}

export const cornerFitsEast = (left: number, right: number): boolean =>
  Boolean(left & CORNER.NE) === Boolean(right & CORNER.NW) && Boolean(left & CORNER.SE) === Boolean(right & CORNER.SW);

export const cornerFitsSouth = (top: number, bottom: number): boolean =>
  Boolean(top & CORNER.SW) === Boolean(bottom & CORNER.NW) && Boolean(top & CORNER.SE) === Boolean(bottom & CORNER.NE);

// --- tiles ----------------------------------------------------------------------

const RESTRICTION: Record<TilesetCollision, number> = { walkable: 0, water: 1, solid: 2 };

/** A transition tile's collision is the more restrictive of its two terrains: solid, then water, then walkable. */
export const restrictiveCollision = (a: TilesetCollision, b: TilesetCollision): TilesetCollision => (RESTRICTION[a] >= RESTRICTION[b] ? a : b);

export type TilesetTile = {
  /** Index in the tileset image, row-major. */
  id: number;
  kind: 'base' | 'transition';
  /** A base tile's terrain. */
  terrain?: string;
  /** A transition tile: `b` over `a`. */
  a?: string;
  b?: string;
  config?: number;
  collision: TilesetCollision;
  image: RgbaImage;
};

export type TilesetBase = { id: string; collision: TilesetCollision; image: RgbaImage };

/** Base tiles first (one per terrain), then each transition's full set in `schemeConfigs` order. */
export function buildTilesetTiles(opts: {
  scheme: TilesetScheme;
  tileSize: number;
  seed: number;
  /** Pixel styles get a hard-edged mask. */
  soft: boolean;
  bases: readonly TilesetBase[];
  transitions: ReadonlyArray<{ a: string; b: string }>;
}): TilesetTile[] {
  const byId = new Map(opts.bases.map((t) => [t.id, t]));
  const tiles: TilesetTile[] = opts.bases.map((t, id) => ({ id, kind: 'base', terrain: t.id, collision: t.collision, image: t.image }));
  const masks = new Map<number, Uint8Array>();
  for (const { a, b } of opts.transitions) {
    const ta = byId.get(a), tb = byId.get(b);
    if (!ta || !tb) throw new Error(`Transition ${a} → ${b} names a terrain the tileset does not have.`);
    for (const config of schemeConfigs(opts.scheme)) {
      let mask = masks.get(config);
      if (!mask) {
        mask = transitionMask({ scheme: opts.scheme, config }, opts.tileSize, opts.seed, opts.soft);
        masks.set(config, mask);
      }
      tiles.push({ id: tiles.length, kind: 'transition', a, b, config, collision: restrictiveCollision(ta.collision, tb.collision), image: compositeTile(ta.image, tb.image, mask) });
    }
  }
  return tiles;
}

/** Lays `tiles` out row-major, `columns` across. */
export function stackTiles(tiles: ReadonlyArray<{ image: RgbaLike }>, cellWidth: number, cellHeight: number, columns: number): { image: RgbaImage; columns: number; rows: number } {
  const cols = Math.max(1, Math.min(columns, tiles.length));
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const image = createRgba(cols * cellWidth, rows * cellHeight);
  tiles.forEach((tile, i) => {
    const ox = (i % cols) * cellWidth, oy = Math.floor(i / cols) * cellHeight;
    for (let y = 0; y < tile.image.height; y += 1)
      for (let x = 0; x < tile.image.width; x += 1) {
        const s = (y * tile.image.width + x) * 4;
        const o = ((oy + y) * image.width + ox + x) * 4;
        for (let c = 0; c < 4; c += 1) image.data[o + c] = tile.image.data[s + c]!;
      }
  });
  return { image, columns: cols, rows };
}

/** Columns of the tileset image. */
export const TILESET_COLUMNS = 8;

/**
 * Tiled's `wangid` for a transition tile: `[top, topright, right, bottomright, bottom, bottomleft, left,
 * topleft]`, colour 2 where the tile is `b` and 1 where it is `a`. A `corner` set uses only the corners.
 */
export function wangId(scheme: TilesetScheme, config: number): number[] {
  const c = (on: boolean | number) => (on ? 2 : 1);
  if (scheme === 'corner16') return [0, c(config & CORNER.NE), 0, c(config & CORNER.SE), 0, c(config & CORNER.SW), 0, c(config & CORNER.NW)];
  return [c(config & BLOB.N), c(config & BLOB.NE), c(config & BLOB.E), c(config & BLOB.SE), c(config & BLOB.S), c(config & BLOB.SW), c(config & BLOB.W), c(config & BLOB.NW)];
}
