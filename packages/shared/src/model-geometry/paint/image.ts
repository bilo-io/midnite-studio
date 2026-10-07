import type { PaintBlendMode } from '../../media-model-pbr';

/**
 * Raster helpers for texture painting (Phase 104 Theme G). Every image the paint kernel touches is RGBA8,
 * row-major, pixel `(x, y)` at uv `((x + 0.5) / width, (y + 0.5) / height)` — glTF's top-left origin, the
 * same convention Theme F's bakes use. A layer's channel image keeps its value in RGB (a scalar channel in
 * all three) and **coverage in alpha**: 0 is "no paint here", so an empty layer is all zeros.
 */
export type PaintImage = { width: number; height: number; data: Uint8Array };

export function createPaintImage(width: number, height = width): PaintImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** A copy of `image` (its pixels are not shared). */
export const clonePaintImage = (image: PaintImage): PaintImage => ({ width: image.width, height: image.height, data: image.data.slice() });

/** An image from a bake's grey (1 channel) or RGB (3 channel) bytes, opaque. */
export function imageFromChannels(size: number, bytes: Uint8Array, channels: 1 | 3 | 4): PaintImage {
  const image = createPaintImage(size);
  const n = size * size;
  for (let i = 0; i < n; i += 1) {
    if (channels === 4) {
      image.data.set(bytes.subarray(i * 4, i * 4 + 4), i * 4);
      continue;
    }
    const r = bytes[i * channels]!;
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = channels === 3 ? bytes[i * 3 + 1]! : r;
    image.data[i * 4 + 2] = channels === 3 ? bytes[i * 3 + 2]! : r;
    image.data[i * 4 + 3] = 255;
  }
  return image;
}

/** Bilinear sample at uv (clamped), 0–1 per component, into `out`. */
export function sampleBilinear(image: PaintImage, u: number, v: number, out: Float32Array | number[] = new Float32Array(4)): Float32Array | number[] {
  const { width: w, height: h, data } = image;
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = (y0 * w + x0) * 4;
  const b = (y0 * w + x1) * 4;
  const c = (y1 * w + x0) * 4;
  const d = (y1 * w + x1) * 4;
  for (let k = 0; k < 4; k += 1) {
    const top = data[a + k]! + (data[b + k]! - data[a + k]!) * fx;
    const bottom = data[c + k]! + (data[d + k]! - data[c + k]!) * fx;
    out[k] = (top + (bottom - top) * fy) / 255;
  }
  return out;
}

/** Nearest-texel sample at uv, 0–1 per component — exact when the image is the size being written. */
export function sampleNearest(image: PaintImage, u: number, v: number, out: Float32Array | number[] = new Float32Array(4)): Float32Array | number[] {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)));
  const at = (y * image.width + x) * 4;
  for (let k = 0; k < 4; k += 1) out[k] = image.data[at + k]! / 255;
  return out;
}

/** `#rgb`/`#rrggbb` → 0–1 sRGB triple. */
export function hexToUnit(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const unitToHex = (rgb: readonly number[]): string =>
  `#${rgb
    .slice(0, 3)
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(low: number, high: number, x: number): number {
  if (high <= low) return x < low ? 0 : 1;
  const t = clamp01((x - low) / (high - low));
  return t * t * (3 - 2 * t);
}

/** One component of a blend mode: `base` below, `top` the layer's value, both 0–1. */
export function blendComponent(mode: PaintBlendMode, base: number, top: number): number {
  switch (mode) {
    case 'normal':
      return top;
    case 'multiply':
      return base * top;
    case 'screen':
      return 1 - (1 - base) * (1 - top);
    case 'overlay':
      return base < 0.5 ? 2 * base * top : 1 - 2 * (1 - base) * (1 - top);
    case 'add':
      return Math.min(1, base + top);
    case 'subtract':
      return Math.max(0, base - top);
    case 'darken':
      return Math.min(base, top);
    case 'lighten':
      return Math.max(base, top);
  }
}

/** `base` with `top` blended over it by `mode`, at `weight` (0 leaves `base`, 1 is the full blend). */
export const blendWeighted = (mode: PaintBlendMode, base: number, top: number, weight: number): number => base + (blendComponent(mode, base, top) - base) * weight;

/**
 * Detail normal `detail` over `base`, both tangent-space unit vectors, by whiteout blending (the usual way to
 * layer a painted normal over a baked one: slopes add, the result stays a unit vector). `weight` fades the
 * detail toward flat first.
 */
export function combineNormals(base: readonly number[], detail: readonly number[], weight: number, out: number[] = [0, 0, 1]): number[] {
  const dx = detail[0]! * weight;
  const dy = detail[1]! * weight;
  const dz = 1 + (detail[2]! - 1) * weight;
  const x = base[0]! + dx;
  const y = base[1]! + dy;
  const z = base[2]! * dz;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** A 0–1 encoded normal (texture bytes / 255) → a unit vector. */
export function decodeNormal(r: number, g: number, b: number, out: number[] = [0, 0, 1]): number[] {
  const x = r * 2 - 1;
  const y = g * 2 - 1;
  const z = b * 2 - 1;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** `image` resampled (bilinear) to `size` — a layer painted at one resolution, read or painted at another. */
export function resizePaintImage(image: PaintImage, size: number): PaintImage {
  if (image.width === size && image.height === size) return image;
  const out = createPaintImage(size);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      sampleBilinear(image, (x + 0.5) / size, (y + 0.5) / size, px);
      const at = (y * size + x) * 4;
      for (let k = 0; k < 4; k += 1) out.data[at + k] = Math.round(px[k]! * 255);
    }
  }
  return out;
}
