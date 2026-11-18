import { decodePng, encodePngRgba8 } from '@midnite/studio-runtime';
import type { RasterImage } from '@midnite/studio-shared';

/** The plan view needs a backdrop, not detail: a drape larger than this is shown at this many pixels on its longest side. */
export const DRAPE_PREVIEW_MAX_SIDE = 1024;
/** What a preview may weigh as a PNG (it crosses IPC on every level read); a busy image steps down a size until it fits. */
export const DRAPE_PREVIEW_MAX_BYTES = 1536 * 1024;
const SIDES = [DRAPE_PREVIEW_MAX_SIDE, 512, 256];
const CACHE_MAX = 8;

/** Box-filter `image` down to `width`×`height`, as RGBA8 (grey, grey+alpha, RGB and 16-bit inputs are widened). */
export function downscaleToRgba8(image: RasterImage, width: number, height: number): Uint8Array {
  const { channels, bitDepth, data } = image;
  const shift = bitDepth === 16 ? 8 : 0;
  const out = new Uint8Array(width * height * 4);
  const sample = (i: number, c: number): number => (data[i * channels + Math.min(c, channels - 1)]! >> shift);
  const rgba = (i: number): [number, number, number, number] =>
    channels >= 3 ? [sample(i, 0), sample(i, 1), sample(i, 2), channels === 4 ? sample(i, 3) : 255] : [sample(i, 0), sample(i, 0), sample(i, 0), channels === 2 ? sample(i, 1) : 255];
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * image.height) / height), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * image.width) / width), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const p = rgba(sy * image.width + sx);
          r += p[0]; g += p[1]; b += p[2]; a += p[3]; n += 1;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/** The PNG `bytes` at most `maxSide` px on its longest side, or `null` when it cannot be decoded or will not fit {@link DRAPE_PREVIEW_MAX_BYTES}. */
export function downscalePng(bytes: Uint8Array, maxSide: number = DRAPE_PREVIEW_MAX_SIDE): Buffer | null {
  const decoded = decodePng(bytes);
  if (!decoded.ok) return null;
  const { image } = decoded;
  for (const side of SIDES.filter((s) => s <= maxSide)) {
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    const png = encodePngRgba8(downscaleToRgba8(image, width, height), width, height);
    if (png.length <= DRAPE_PREVIEW_MAX_BYTES) return png;
  }
  return null;
}

/** Previews by source file: keyed on path, mtime and size, so an edited drape is re-made and an untouched one never is. Oldest out past {@link CACHE_MAX}. */
const cache = new Map<string, string | null>();

/** For tests. */
export function clearDrapePreviewCache(): void {
  cache.clear();
}

/** The cached `data:image/png` preview for a source PNG, making it with `make` on a miss. */
export async function cachedDrapePreview(real: string, stat: { mtimeMs: number; size: number }, make: () => Promise<Buffer | null>): Promise<string | null> {
  const key = `${real}\0${stat.mtimeMs}\0${stat.size}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const png = await make();
  const url = png ? `data:image/png;base64,${png.toString('base64')}` : null;
  cache.set(key, url);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return url;
}
