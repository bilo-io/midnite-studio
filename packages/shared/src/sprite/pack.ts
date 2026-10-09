import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Atlas packing (Phase 106 Theme G): MaxRects with the best-short-side-fit heuristic, trimming,
 * padding and an edge extrude against texture bleeding. Rotation is never used — Phaser's JSON-hash
 * `rotated` stays false. Frames that do not fit one `maxSize` page spill onto further pages.
 *
 * A placed rect's *cell* is its content plus `extrude` on every side plus `padding` on the right and
 * bottom; cells never overlap, so two frames are always at least `padding` apart (extrude included).
 * The page is sized to its content, then rounded up to a power of two when `pot` is set.
 */
export type PackRect = { key: string; w: number; h: number };
export type PackOptions = { maxSize: 2048 | 4096; padding: number; extrude: 0 | 1; pot: boolean };
export type PackPlacement = { key: string; x: number; y: number; w: number; h: number };
export type PackPage = { w: number; h: number; placements: PackPlacement[] };
export type PackResult = { pages: PackPage[] };

export const DEFAULT_PACK_OPTIONS: PackOptions = { maxSize: 2048, padding: 2, extrude: 1, pot: true };

type Box = { x: number; y: number; w: number; h: number };

const nextPot = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/** One MaxRects bin. Coordinates are cell coordinates (content minus extrude). */
class MaxRectsBin {
  private free: Box[];
  readonly used: Array<Box & { key: string }> = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /** The best-short-side-fit spot for a `w × h` cell, or `null` when nothing fits. */
  find(w: number, h: number): { box: Box; short: number; long: number } | null {
    let best: { box: Box; short: number; long: number } | null = null;
    for (const f of this.free) {
      if (w > f.w || h > f.h) continue;
      const dw = f.w - w;
      const dh = f.h - h;
      const short = Math.min(dw, dh);
      const long = Math.max(dw, dh);
      if (!best || short < best.short || (short === best.short && long < best.long)) best = { box: { x: f.x, y: f.y, w, h }, short, long };
    }
    return best;
  }

  place(key: string, box: Box): void {
    const kept: Box[] = [];
    const pieces: Box[] = [];
    for (const f of this.free) {
      if (!intersects(f, box)) {
        kept.push(f);
        continue;
      }
      // Split the free rect around the placed one into up to four maximal pieces.
      if (box.x > f.x) pieces.push({ x: f.x, y: f.y, w: box.x - f.x, h: f.h });
      if (box.x + box.w < f.x + f.w) pieces.push({ x: box.x + box.w, y: f.y, w: f.x + f.w - (box.x + box.w), h: f.h });
      if (box.y > f.y) pieces.push({ x: f.x, y: f.y, w: f.w, h: box.y - f.y });
      if (box.y + box.h < f.y + f.h) pieces.push({ x: f.x, y: box.y + box.h, w: f.w, h: f.y + f.h - (box.y + box.h) });
    }
    // Only new pieces can be redundant: a kept rect was already maximal, and no piece (a subset of
    // a rect it was not inside) can contain it.
    const fresh = pieces.filter((a, i) => !kept.some((b) => contains(b, a)) && !pieces.some((b, j) => j !== i && contains(b, a) && (!contains(a, b) || j < i)));
    this.free = [...kept, ...fresh];
    this.used.push({ ...box, key });
  }
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/**
 * Packs `rects` onto as few pages as it can. Placements are in input order per page; `x`/`y` are the
 * content's top-left (the extrude ring sits just outside it). Throws when one rect alone cannot fit.
 */
export function packRects(rects: readonly PackRect[], options: Partial<PackOptions> = {}): PackResult {
  const opts = { ...DEFAULT_PACK_OPTIONS, ...options };
  const pad = Math.max(0, Math.min(8, Math.round(opts.padding)));
  const e = opts.extrude;
  // The trailing padding of the last column/row may hang past the page edge, so the bin is `pad` larger.
  const binSize = opts.maxSize + pad;
  const order = rects
    .map((r, index) => ({ ...r, index }))
    .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.index - b.index);
  const bins: MaxRectsBin[] = [];
  for (const r of order) {
    const cw = r.w + 2 * e + pad;
    const ch = r.h + 2 * e + pad;
    if (r.w + 2 * e > opts.maxSize || r.h + 2 * e > opts.maxSize) {
      throw new Error(`Frame ${r.key} (${r.w} × ${r.h}) does not fit a ${opts.maxSize} px atlas page.`);
    }
    let placed = false;
    for (const bin of bins) {
      const spot = bin.find(cw, ch);
      if (spot) {
        bin.place(r.key, spot.box);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const bin = new MaxRectsBin(binSize, binSize);
      const spot = bin.find(cw, ch)!;
      bin.place(r.key, spot.box);
      bins.push(bin);
    }
  }
  const sizeOf = new Map(rects.map((r) => [r.key, r]));
  const indexOf = new Map(rects.map((r, i) => [r.key, i]));
  return {
    pages: bins.map((bin) => {
      let w = 1;
      let h = 1;
      for (const u of bin.used) {
        w = Math.max(w, u.x + u.w - pad);
        h = Math.max(h, u.y + u.h - pad);
      }
      if (opts.pot) {
        w = Math.min(nextPot(w), opts.maxSize);
        h = Math.min(nextPot(h), opts.maxSize);
      }
      const placements = bin.used
        .map((u) => {
          const r = sizeOf.get(u.key)!;
          return { key: u.key, x: u.x + e, y: u.y + e, w: r.w, h: r.h };
        })
        .sort((a, b) => indexOf.get(a.key)! - indexOf.get(b.key)!);
      return { w, h, placements };
    }),
  };
}

export type SpriteSourceSize = { x: number; y: number; w: number; h: number };
export type TrimmedFrame = { image: RgbaImage; spriteSourceSize: SpriteSourceSize; sourceSize: { w: number; h: number }; trimmed: boolean };

/**
 * Crops a frame to its non-transparent pixels. `spriteSourceSize` is where the crop sat in the
 * untrimmed frame and `sourceSize` the frame's full size — what an engine needs to put it back. An
 * empty frame keeps one transparent pixel at the origin.
 */
export function trimFrame(img: RgbaLike): TrimmedFrame {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[(y * img.width + x) * 4 + 3]! === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const sourceSize = { w: img.width, h: img.height };
  if (maxX < 0) return { image: createRgba(1, 1), spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, sourceSize, trimmed: true };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = createRgba(w, h);
  for (let y = 0; y < h; y += 1) {
    const from = ((minY + y) * img.width + minX) * 4;
    for (let i = 0; i < w * 4; i += 1) out.data[y * w * 4 + i] = img.data[from + i]!;
  }
  return { image: out, spriteSourceSize: { x: minX, y: minY, w, h }, sourceSize, trimmed: w !== img.width || h !== img.height };
}

/**
 * Copies `img` onto `page` at (`x`, `y`) and repeats its outermost pixels `extrude` px outward
 * (corners included), so bilinear sampling at the frame's edge never reads a neighbour.
 */
export function blitExtruded(page: RgbaImage, img: RgbaLike, x: number, y: number, extrude: number): void {
  for (let dy = -extrude; dy < img.height + extrude; dy += 1) {
    const py = y + dy;
    if (py < 0 || py >= page.height) continue;
    const sy = Math.min(img.height - 1, Math.max(0, dy));
    for (let dx = -extrude; dx < img.width + extrude; dx += 1) {
      const px = x + dx;
      if (px < 0 || px >= page.width) continue;
      const sx = Math.min(img.width - 1, Math.max(0, dx));
      const s = (sy * img.width + sx) * 4;
      const o = (py * page.width + px) * 4;
      page.data[o] = img.data[s]!;
      page.data[o + 1] = img.data[s + 1]!;
      page.data[o + 2] = img.data[s + 2]!;
      page.data[o + 3] = img.data[s + 3]!;
    }
  }
}

/**
 * A stored frame as the sheet shows it: mirrored about the anchor's column when `flipped` (Theme D
 * writes a mirrored side's `w` frames unflipped, with the flag), then moved by `anchorNudge`. The
 * frame keeps its size; pixels pushed past the edge are dropped.
 */
export function composeFrame(img: RgbaLike, meta: { flipped: boolean; anchorNudge: readonly [number, number] }, anchorX = 0.5): RgbaImage {
  const out = createRgba(img.width, img.height);
  const [dx, dy] = meta.anchorNudge;
  const axis = Math.round(2 * anchorX * img.width) - 1;
  for (let y = 0; y < img.height; y += 1) {
    const ty = y + dy;
    if (ty < 0 || ty >= img.height) continue;
    for (let x = 0; x < img.width; x += 1) {
      const fx = meta.flipped ? axis - x : x;
      const tx = fx + dx;
      if (fx < 0 || fx >= img.width || tx < 0 || tx >= img.width) continue;
      const s = (y * img.width + x) * 4;
      const o = (ty * img.width + tx) * 4;
      out.data[o] = img.data[s]!;
      out.data[o + 1] = img.data[s + 1]!;
      out.data[o + 2] = img.data[s + 2]!;
      out.data[o + 3] = img.data[s + 3]!;
    }
  }
  return out;
}
