import type { RasterImage } from '../terrain/raster';

/**
 * The frame pipeline's picture: 8-bit RGBA, row-major, straight (not premultiplied) alpha. Pure typed
 * arrays — decode and encode live in desktop main (`png-codec.ts`); everything in `shared/src/sprite/`
 * reads and writes this shape.
 */
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

/** Anything RGBA-shaped the kernels only read (lets callers pass a `Uint8Array`-backed image). */
export type RgbaLike = { width: number; height: number; data: ArrayLike<number> };

export type Rgb = readonly [number, number, number];

export function createRgba(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneRgba(img: RgbaLike): RgbaImage {
  return { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) };
}

/** A decoded PNG (any channel count, 8 or 16 bit) as 8-bit RGBA. */
export function rgbaFromRaster(raster: RasterImage): RgbaImage {
  const { width, height, channels, bitDepth, data } = raster;
  const out = createRgba(width, height);
  const shift = bitDepth === 16 ? 8 : 0;
  for (let i = 0; i < width * height; i += 1) {
    const s = i * channels;
    const o = i * 4;
    const v = (c: number) => (data[s + c]! >> shift) & 0xff;
    if (channels === 1 || channels === 2) {
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v(0);
      out.data[o + 3] = channels === 2 ? v(1) : 255;
    } else {
      out.data[o] = v(0);
      out.data[o + 1] = v(1);
      out.data[o + 2] = v(2);
      out.data[o + 3] = channels === 4 ? v(3) : 255;
    }
  }
  return out;
}

/** Whether any pixel is less than fully opaque — a provider that returned real alpha. */
export function hasPartialAlpha(img: RgbaLike): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 255) return true;
  return false;
}

/** Fraction of pixels whose alpha is above `threshold`. */
export function opaqueFraction(img: RgbaLike, threshold = 8): number {
  const total = img.width * img.height;
  if (total === 0) return 0;
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > threshold) n += 1;
  return n / total;
}

/** Every alpha becomes 0 or 255 (pixel-art mode: no partial alpha). */
export function thresholdAlpha(img: RgbaImage, cut = 128): RgbaImage {
  const out = cloneRgba(img);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = out.data[i]! >= cut ? 255 : 0;
  return out;
}

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** sRGB (0–255) → CIE L*a*b* (D65). */
export function rgbToLab([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two sRGB colours. */
export function deltaE(a: Rgb, b: Rgb): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
