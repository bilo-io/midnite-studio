/** Synthetic road masks for the Theme H tests — not exported from the barrel. */
import type { RasterImage } from './raster';

/** An RGB raster of `size`² filled with `bg`, with `paint(x, y)` pixels set to `fg`. */
export function paintedRaster(
  size: number,
  paint: (x: number, y: number) => boolean,
  fg: [number, number, number] = [0, 255, 255],
  bg: [number, number, number] = [0, 0, 0],
): RasterImage {
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data.set(paint(x, y) ? fg : bg, (y * size + x) * 3);
  }
  return { width: size, height: size, channels: 3, bitDepth: 8, data };
}

/** A binary mask of `size`² from a predicate. */
export function paintedMask(size: number, paint: (x: number, y: number) => boolean): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) mask[y * size + x] = paint(x, y) ? 1 : 0;
  return mask;
}
