import { cloneRgba, hexToRgb, rgbToHex, labOf, type Rgb, type RgbaImage } from './image';

/**
 * Pixel-art palettes. {@link medianCut} builds one palette over every frame of a sheet (so colours do
 * not drift between frames); {@link mapToPalette} snaps each pixel to its nearest palette colour in
 * L*a*b*.
 */

/** Default palette size when a pixel sheet names neither colours nor a size. */
export const SPRITE_DEFAULT_PALETTE_SIZE = 32;

type Box = { pixels: Rgb[] };

const range = (pixels: readonly Rgb[], c: 0 | 1 | 2): number => {
  let lo = 255, hi = 0;
  for (const p of pixels) {
    if (p[c] < lo) lo = p[c];
    if (p[c] > hi) hi = p[c];
  }
  return hi - lo;
};

/**
 * Median cut over the opaque (alpha ≥ 128) pixels of one or more RGBA buffers: repeatedly split the
 * box with the widest channel range at its median until there are `size` boxes (or none can split).
 * Returns at most `size` `#rrggbb` colours — each box's mean — de-duplicated.
 */
export function medianCut(pixels: ArrayLike<number> | readonly ArrayLike<number>[], size: number): string[] {
  const buffers = isList(pixels) ? pixels : [pixels];
  const all: Rgb[] = [];
  for (const buf of buffers)
    for (let i = 0; i + 3 < buf.length; i += 4) if (buf[i + 3]! >= 128) all.push([buf[i]!, buf[i + 1]!, buf[i + 2]!]);
  if (all.length === 0 || size <= 0) return [];
  const boxes: Box[] = [{ pixels: all }];
  while (boxes.length < size) {
    let best = -1, bestRange = 0, bestChannel: 0 | 1 | 2 = 0;
    boxes.forEach((box, i) => {
      if (box.pixels.length < 2) return;
      for (const c of [0, 1, 2] as const) {
        const r = range(box.pixels, c);
        if (r > bestRange) {
          bestRange = r;
          best = i;
          bestChannel = c;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best]!;
    const sorted = [...box.pixels].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = sorted.length >> 1;
    boxes.splice(best, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }
  const colours = boxes.map(({ pixels: ps }) => {
    const sum = ps.reduce<[number, number, number]>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    return rgbToHex([sum[0] / ps.length, sum[1] / ps.length, sum[2] / ps.length]);
  });
  return [...new Set(colours)];
}

function isList(value: ArrayLike<number> | readonly ArrayLike<number>[]): value is readonly ArrayLike<number>[] {
  return value.length > 0 && typeof (value as ArrayLike<unknown>)[0] === 'object';
}

/** Every opaque pixel snapped to its nearest palette colour (L*a*b*); alpha is untouched. */
export function mapToPalette(img: RgbaImage, palette: readonly string[]): RgbaImage {
  const out = cloneRgba(img);
  if (palette.length === 0) return out;
  const entries = palette.map((hex) => ({ rgb: hexToRgb(hex), lab: labOf(hexToRgb(hex)) }));
  const cache = new Map<number, Rgb>();
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
    let hit = cache.get(key);
    if (!hit) {
      const lab = labOf([d[i]!, d[i + 1]!, d[i + 2]!]);
      let bestD = Infinity;
      for (const e of entries) {
        const dist = (lab[0] - e.lab[0]) ** 2 + (lab[1] - e.lab[1]) ** 2 + (lab[2] - e.lab[2]) ** 2;
        if (dist < bestD) {
          bestD = dist;
          hit = e.rgb;
        }
      }
      cache.set(key, hit!);
    }
    d[i] = hit![0];
    d[i + 1] = hit![1];
    d[i + 2] = hit![2];
  }
  return out;
}
