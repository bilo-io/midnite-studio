import { createRgba, hexToRgb, type RgbaImage } from './image';

/** A filled disc of `colour` on an opaque `background`, with a 1 px anti-aliased rim. */
export function discOn(size: number, cx: number, cy: number, r: number, colour: string, background: string): RgbaImage {
  const img = createRgba(size, size);
  const fg = hexToRgb(colour);
  const bg = hexToRgb(background);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const t = Math.min(1, Math.max(0, r + 0.5 - d));
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) img.data[o + c] = Math.round(fg[c]! * t + bg[c]! * (1 - t));
      img.data[o + 3] = 255;
    }
  return img;
}

/** An opaque `colour` rectangle on a transparent canvas. */
export function rectOn(width: number, height: number, x0: number, y0: number, w: number, h: number, colour = '#c03030'): RgbaImage {
  const img = createRgba(width, height);
  const [r, g, b] = hexToRgb(colour);
  for (let y = y0; y < y0 + h; y += 1)
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const o = (y * width + x) * 4;
      img.data.set([r, g, b, 255], o);
    }
  return img;
}
