/**
 * Road-mask extraction (Phase 105 Theme H). The roads input is a mask — light roads on a dark
 * background, usually cyan — so the road colour is keyed by hue, with a luminance fallback when no
 * single saturated hue dominates.
 */
import { filterComponents, morphClose, morphOpen } from './morphology';
import type { RasterImage } from './raster';

/** Below this share of the saturated pixels in the peak hue bin, there is no dominant road colour. */
export const ROAD_HUE_DOMINANCE = 0.6;
/** Luminance fallback threshold, `[0, 1]`. */
export const ROAD_LUMINANCE_THRESHOLD = 0.5;
const HUE_BINS = 36;

type Rgb = [number, number, number];

/** One pixel as 0..1 RGB, whatever the raster's channel count and depth. */
function pixel(img: RasterImage, i: number): Rgb {
  const max = img.bitDepth === 16 ? 65535 : 255;
  const base = i * img.channels;
  const d = img.data;
  if (img.channels >= 3) return [d[base]! / max, d[base + 1]! / max, d[base + 2]! / max];
  const g = d[base]! / max;
  return [g, g, g];
}

function hsv([r, g, b]: Rgb): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;

const fromHex = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * The dominant saturated hue: a 36-bin hue histogram over pixels with S > 0.4 and V > 0.4. The peak
 * bin wins when it holds ≥ 60 % of them, and the colour reported is the mean of that bin's pixels.
 * `null` means "no dominant hue" — the caller keys on luminance instead.
 */
export function detectRoadColour(img: RasterImage): { colour: string | null } {
  const count = img.width * img.height;
  const bins = new Uint32Array(HUE_BINS);
  const sums = new Float64Array(HUE_BINS * 3);
  let saturated = 0;
  for (let i = 0; i < count; i += 1) {
    const rgb = pixel(img, i);
    const { h, s, v } = hsv(rgb);
    if (s <= 0.4 || v <= 0.4) continue;
    const bin = Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
    bins[bin] = bins[bin]! + 1;
    sums[bin * 3] = sums[bin * 3]! + rgb[0];
    sums[bin * 3 + 1] = sums[bin * 3 + 1]! + rgb[1];
    sums[bin * 3 + 2] = sums[bin * 3 + 2]! + rgb[2];
    saturated += 1;
  }
  if (saturated === 0) return { colour: null };
  let peak = 0;
  for (let b = 1; b < HUE_BINS; b += 1) if (bins[b]! > bins[peak]!) peak = b;
  if (bins[peak]! / saturated < ROAD_HUE_DOMINANCE) return { colour: null };
  const n = bins[peak]!;
  return { colour: toHex([sums[peak * 3]! / n, sums[peak * 3 + 1]! / n, sums[peak * 3 + 2]! / n]) };
}

/**
 * Binary road mask (1 = road). With a colour, a pixel is road when its RGB distance to it —
 * normalised so black-to-white is 1 — is within `tolerance`. Without one, luminance above 0.5.
 * Fully transparent pixels (outside an aligned image) are never road.
 */
export function extractRoadMask(img: RasterImage, colour: string | null, tolerance: number): Uint8Array {
  const count = img.width * img.height;
  const out = new Uint8Array(count);
  const key = colour ? fromHex(colour) : null;
  const maxAlpha = img.bitDepth === 16 ? 65535 : 255;
  for (let i = 0; i < count; i += 1) {
    if (img.channels === 4 && img.data[i * 4 + 3]! < maxAlpha / 2) continue;
    if (img.channels === 2 && img.data[i * 2 + 1]! < maxAlpha / 2) continue;
    const [r, g, b] = pixel(img, i);
    if (key) {
      const d = Math.hypot(r - key[0], g - key[1], b - key[2]) / Math.sqrt(3);
      if (d <= tolerance) out[i] = 1;
    } else if (0.2126 * r + 0.7152 * g + 0.0722 * b > ROAD_LUMINANCE_THRESHOLD) {
      out[i] = 1;
    }
  }
  return out;
}

/** 3×3 close (bridge small gaps), 3×3 open (drop specks), then drop components under `minPixels`. */
export function cleanRoadMask(mask: Uint8Array, w: number, h: number, minPixels: number): Uint8Array {
  const cleaned = morphOpen(morphClose(mask, w, h), w, h);
  return minPixels > 1 ? filterComponents(cleaned, w, h, minPixels) : cleaned;
}

/** The colour at image UV `(u, v)` (0..1, top-left origin) — the panel's eyedropper. */
export function pickColour(img: RasterImage, u: number, v: number): string {
  const x = Math.max(0, Math.min(img.width - 1, Math.floor(u * img.width)));
  const y = Math.max(0, Math.min(img.height - 1, Math.floor(v * img.height)));
  return toHex(pixel(img, y * img.width + x));
}

/** Intersection over union of two equal-sized binary masks; 1 when both are empty. */
export function maskIoU(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]! > 0;
    const y = b[i]! > 0;
    if (x && y) inter += 1;
    if (x || y) union += 1;
  }
  return union === 0 ? 1 : inter / union;
}
