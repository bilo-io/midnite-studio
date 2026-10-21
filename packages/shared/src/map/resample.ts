/**
 * Stitching and resampling of Mercator tile mosaics onto the capture's local square.
 */
import { fromFrame, type CaptureFrame } from './frame';
import { lonLatToWorld } from './mercator';
import type { TilePlan } from './capture-plan';

export interface Mosaic {
  data: Float32Array;
  width: number;
  height: number;
}

export interface DecodedTile {
  x: number;
  y: number;
  /** `tileSize²` heights (or, with `channels`, interleaved samples). */
  data: Float32Array | Uint8Array;
}

/** Copies decoded tiles into one mosaic. Missing tiles stay `fill` (NaN for DEM). */
export function stitchMosaic<T extends Float32Array | Uint8Array>(
  plan: TilePlan,
  tiles: readonly { x: number; y: number; data: T }[],
  make: (len: number) => T,
  channels = 1,
  fill?: number,
): { data: T; width: number; height: number } {
  const ts = plan.tileSize;
  const width = plan.cols * ts;
  const height = plan.rows * ts;
  const data = make(width * height * channels);
  if (fill !== undefined) data.fill(fill);
  for (const t of tiles) {
    const c = t.x - plan.x0;
    const r = t.y - plan.y0;
    if (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows) continue;
    for (let row = 0; row < ts; row += 1) {
      const src = t.data.subarray(row * ts * channels, (row + 1) * ts * channels);
      data.set(src, ((r * ts + row) * width + c * ts) * channels);
    }
  }
  return { data, width, height };
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}

/** Bicubic (Catmull-Rom) sample at fractional pixel `(u, v)`, clamped to the 2×2 neighbours' range. */
export function sampleBicubic(m: Mosaic, u: number, v: number): number {
  const { data, width, height } = m;
  const x1 = Math.floor(u);
  const y1 = Math.floor(v);
  const tx = u - x1;
  const ty = v - y1;
  const cx = (x: number) => (x < 0 ? 0 : x >= width ? width - 1 : x);
  const cy = (y: number) => (y < 0 ? 0 : y >= height ? height - 1 : y);
  const rows = [0, 0, 0, 0];
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < 4; j += 1) {
    const base = cy(y1 - 1 + j) * width;
    const p0 = data[base + cx(x1 - 1)]!;
    const p1 = data[base + cx(x1)]!;
    const p2 = data[base + cx(x1 + 1)]!;
    const p3 = data[base + cx(x1 + 2)]!;
    if (j === 1 || j === 2) {
      lo = Math.min(lo, p1, p2);
      hi = Math.max(hi, p1, p2);
    }
    rows[j] = cubic(p0, p1, p2, p3, tx);
  }
  const value = cubic(rows[0]!, rows[1]!, rows[2]!, rows[3]!, ty);
  if (Number.isNaN(value)) return Number.NaN;
  return value < lo ? lo : value > hi ? hi : value;
}

/** Bilinear sample over `channels` interleaved bytes, written into `out` at `o`. */
export function sampleBilinearRgba(
  data: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
  out: Uint8Array,
  o: number,
): void {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(u)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(v)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, u - x0));
  const fy = Math.max(0, Math.min(1, v - y0));
  for (let c = 0; c < 4; c += 1) {
    const a = data[(y0 * width + x0) * 4 + c]!;
    const b = data[(y0 * width + x1) * 4 + c]!;
    const cc = data[(y1 * width + x0) * 4 + c]!;
    const d = data[(y1 * width + x1) * 4 + c]!;
    out[o + c] = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy);
  }
}

const LATTICE_STEP = 16;

/**
 * Maps output grid coordinates (`gx`, `gy` ∈ [0, count−1] pitch positions, in fractions of the
 * square) to mosaic pixel coordinates. The geodesic inverse is evaluated on a coarse lattice and
 * interpolated bilinearly — the mapping is smooth, and 16.8 M Vincenty calls for a 4097² grid are not.
 */
export function makeMosaicMapper(
  frame: CaptureFrame,
  plan: TilePlan,
  /** 0 → vertex-centred (grid points on the square's edge); 0.5 → pixel-centred. */
  samples: { count: number; centred: 'vertex' | 'pixel' },
): (i: number, j: number) => [number, number] {
  const { count } = samples;
  const S = frame.sideM;
  const scale = 2 ** plan.z * plan.tileSize;
  const coord = (k: number) =>
    samples.centred === 'vertex'
      ? -S / 2 + (k * S) / (count - 1)
      : -S / 2 + ((k + 0.5) * S) / count;
  const last = count - 1;
  const cells = Math.max(1, Math.ceil(last / LATTICE_STEP));
  const nodes = cells + 1;
  const us = new Float64Array(nodes * nodes);
  const vs = new Float64Array(nodes * nodes);
  for (let b = 0; b < nodes; b += 1) {
    const kz = (b * last) / cells;
    for (let a = 0; a < nodes; a += 1) {
      const kx = (a * last) / cells;
      const [lon, lat] = fromFrame(frame.center, [coord(kx), coord(kz)]);
      const [wx, wy] = lonLatToWorld(lon, lat);
      us[b * nodes + a] = wx * scale - plan.x0 * plan.tileSize;
      vs[b * nodes + a] = wy * scale - plan.y0 * plan.tileSize;
    }
  }
  return (i, j) => {
    const fa = last === 0 ? 0 : (i * cells) / last;
    const fb = last === 0 ? 0 : (j * cells) / last;
    const a0 = Math.min(cells - 1, Math.floor(fa));
    const b0 = Math.min(cells - 1, Math.floor(fb));
    const ta = fa - a0;
    const tb = fb - b0;
    const at = (arr: Float64Array) =>
      (arr[b0 * nodes + a0]! * (1 - ta) + arr[b0 * nodes + a0 + 1]! * ta) * (1 - tb) +
      (arr[(b0 + 1) * nodes + a0]! * (1 - ta) + arr[(b0 + 1) * nodes + a0 + 1]! * ta) * tb;
    // Tile pixel k covers [k, k+1) and is *centred* on k + 0.5.
    return [at(us) - 0.5, at(vs) - 0.5];
  };
}
