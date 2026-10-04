/**
 * The heightfield kernel: resample an image's samples onto a square 2ⁿ+1 grid, map them to metres,
 * and answer normals and stats. Pure typed arrays — runs in the build worker and (for normals and
 * meshing) the renderer alike.
 */
export type Heightfield = {
  /** Vertices per side. */
  resolution: number;
  /** Metres per side. */
  worldSize: number;
  /** Row-major, `heights[z * resolution + x]`, metres. */
  heights: Float32Array;
};

export const NON_SQUARE_WARNING = 'Non-square heightmap stretched to a square extent.';

/** Catmull-Rom weights (a = -0.5) for the four taps around a fractional position `t`. */
function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
}

/**
 * Bicubic (Catmull-Rom) resample of a `srcW × srcH` field onto a `res × res` grid, edge-clamped. The
 * grid's corner vertices land exactly on the source's corner samples, and a source of the same size
 * comes back unchanged; a non-square source is stretched to a square.
 */
export function resampleBicubic(src: Float32Array, srcW: number, srcH: number, res: number): Float32Array {
  const out = new Float32Array(res * res);
  if (srcW === res && srcH === res) {
    out.set(src);
    return out;
  }
  const xw = new Float32Array(res * 4);
  const xi = new Int32Array(res * 4);
  const xScale = res > 1 ? (srcW - 1) / (res - 1) : 0;
  for (let x = 0; x < res; x += 1) {
    const sx = x * xScale;
    const x0 = Math.floor(sx);
    const w = catmullRom(sx - x0);
    for (let k = 0; k < 4; k += 1) {
      xw[x * 4 + k] = w[k]!;
      xi[x * 4 + k] = Math.min(srcW - 1, Math.max(0, x0 - 1 + k));
    }
  }
  const yScale = res > 1 ? (srcH - 1) / (res - 1) : 0;
  for (let z = 0; z < res; z += 1) {
    const sy = z * yScale;
    const y0 = Math.floor(sy);
    const wy = catmullRom(sy - y0);
    const rows = [0, 1, 2, 3].map((k) => Math.min(srcH - 1, Math.max(0, y0 - 1 + k)) * srcW);
    for (let x = 0; x < res; x += 1) {
      let acc = 0;
      for (let j = 0; j < 4; j += 1) {
        const row = rows[j]!;
        let rowAcc = 0;
        for (let k = 0; k < 4; k += 1) rowAcc += src[row + xi[x * 4 + k]!]! * xw[x * 4 + k]!;
        acc += rowAcc * wy[j]!;
      }
      out[z * res + x] = acc;
    }
  }
  return out;
}

/** Separable Gaussian blur, radius `ceil(3σ)`, edge-clamped. `height` defaults to `width` (a square field). */
export function gaussianBlur(h: Float32Array, width: number, sigma: number, height: number = width): Float32Array {
  if (sigma <= 0) return h.slice();
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = kernel[i]! / sum;
  const tmp = new Float32Array(h.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) acc += h[y * width + Math.min(width - 1, Math.max(0, x + k))]! * kernel[k + radius]!;
      tmp[y * width + x] = acc;
    }
  }
  const out = new Float32Array(h.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) acc += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x]! * kernel[k + radius]!;
      out[y * width + x] = acc;
    }
  }
  return out;
}

export type HeightfieldSpec = {
  resolution: number;
  worldSize: number;
  heightRange: readonly [number, number];
  /** Gaussian σ in *source* pixels, applied before resampling. */
  preSmooth?: number;
};

/**
 * Samples in `[0, 1]` → a metres heightfield: optional pre-smooth, bicubic resample to the grid, then
 * `lo + v * (hi - lo)` (clamped, since Catmull-Rom overshoots). A non-square source is stretched;
 * callers add {@link NON_SQUARE_WARNING} themselves, via {@link isNonSquare}.
 */
export function buildHeightfield(samples: Float32Array, srcW: number, srcH: number, spec: HeightfieldSpec): Heightfield {
  const smoothed = spec.preSmooth && spec.preSmooth > 0 ? gaussianBlur(samples, srcW, spec.preSmooth, srcH) : samples;
  const grid = resampleBicubic(smoothed, srcW, srcH, spec.resolution);
  const [lo, hi] = spec.heightRange;
  const span = hi - lo;
  const heights = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i += 1) heights[i] = lo + Math.min(1, Math.max(0, grid[i]!)) * span;
  return { resolution: spec.resolution, worldSize: spec.worldSize, heights };
}

export const isNonSquare = (width: number, height: number): boolean => width !== height;

/**
 * Unit normals, `(x, y, z)` per vertex (y up), by central differences — one-sided at the edges.
 * World spacing is `worldSize / (resolution - 1)` metres per cell on both axes.
 */
export function heightfieldNormals(f: Heightfield): Float32Array {
  const { resolution: n } = f;
  const out = new Float32Array(n * n * 3);
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      const nm = normalAt(f, x, z);
      const o = (z * n + x) * 3;
      out[o] = nm[0];
      out[o + 1] = nm[1];
      out[o + 2] = nm[2];
    }
  }
  return out;
}

/** One vertex's unit normal — what {@link heightfieldNormals} and the chunk mesher share. */
export function normalAt(f: Heightfield, x: number, z: number): [number, number, number] {
  const n = f.resolution;
  const h = f.heights;
  const cell = f.worldSize / (n - 1);
  const xa = Math.max(0, x - 1);
  const xb = Math.min(n - 1, x + 1);
  const za = Math.max(0, z - 1);
  const zb = Math.min(n - 1, z + 1);
  const dx = (h[z * n + xb]! - h[z * n + xa]!) / ((xb - xa) * cell);
  const dz = (h[zb * n + x]! - h[za * n + x]!) / ((zb - za) * cell);
  const len = Math.hypot(dx, 1, dz);
  return [-dx / len, 1 / len, -dz / len];
}

export const HEIGHT_HISTOGRAM_BINS = 16;

/** Min, max and a 16-bin equal-width histogram (a flat field lands entirely in bin 0). */
export function heightfieldStats(f: Heightfield): { min: number; max: number; histogram: number[] } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < f.heights.length; i += 1) {
    const v = f.heights[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const histogram = new Array<number>(HEIGHT_HISTOGRAM_BINS).fill(0);
  const span = max - min;
  for (let i = 0; i < f.heights.length; i += 1) {
    const bin = span > 0 ? Math.min(HEIGHT_HISTOGRAM_BINS - 1, Math.floor(((f.heights[i]! - min) / span) * HEIGHT_HISTOGRAM_BINS)) : 0;
    histogram[bin] = histogram[bin]! + 1;
  }
  return { min, max, histogram };
}
