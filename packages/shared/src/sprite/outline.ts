import { cloneRgba, hexToRgb, labOf, type RgbaImage } from './image';

/** The palette colour with the lowest L* — the outline colour in pixel mode. */
export function darkestColour(palette: readonly string[]): string {
  let best = '#000000';
  let bestL = Infinity;
  for (const hex of palette) {
    const l = labOf(hexToRgb(hex))[0];
    if (l < bestL) {
      bestL = l;
      best = hex;
    }
  }
  return best;
}

/**
 * A hard 1 px outline: every transparent pixel 4-adjacent to an opaque one (alpha ≥ 128) becomes
 * `colour`, fully opaque. Nothing is drawn past the frame's edge.
 */
export function outline1px(img: RgbaImage, colour = '#000000'): RgbaImage {
  const out = cloneRgba(img);
  const [r, g, b] = hexToRgb(colour);
  const { width: w, height: h, data } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! >= 128;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        const o = (y * w + x) * 4;
        out.data[o] = r;
        out.data[o + 1] = g;
        out.data[o + 2] = b;
        out.data[o + 3] = 255;
      }
    }
  return out;
}
