/** Heightmap capture: resample a DEM mosaic onto the vertex-centred ENU square, and encode helpers. */
import type { TilePlan } from './capture-plan';
import { countNoData, fillNoData } from './dem';
import type { CaptureFrame } from './frame';
import { makeMosaicMapper, sampleBicubic, type Mosaic } from './resample';

export const MAP_NODATA_LIMIT = 0.25;
export const MAP_NODATA_MESSAGE = 'The elevation source has no data for most of this area.';

export interface HeightmapResult {
  ok: true;
  /** `size²` metres, row 0 = NORTH edge, vertex-centred (matches Terrain's `buildHeightfield`). */
  heights: Float32Array;
  minM: number;
  maxM: number;
}

export type HeightmapOutcome = HeightmapResult | { ok: false; message: string };

/**
 * `heights[j·n + i]` is the DEM at `x = −S/2 + i·S/(n−1)`, `z = −S/2 + j·S/(n−1)` (`z` south, so
 * row 0 is the north edge). `isCancelled` is polled once per row so a cancel is prompt.
 */
export function resampleHeightmap(
  mosaic: Mosaic,
  plan: TilePlan,
  frame: CaptureFrame,
  size: number,
  isCancelled?: () => boolean,
): HeightmapOutcome {
  const map = makeMosaicMapper(frame, plan, { count: size, centred: 'vertex' });
  const heights = new Float32Array(size * size);
  for (let j = 0; j < size; j += 1) {
    if (isCancelled?.()) return { ok: false, message: 'Capture cancelled.' };
    for (let i = 0; i < size; i += 1) {
      const [u, v] = map(i, j);
      heights[j * size + i] = sampleBicubic(mosaic, u, v);
    }
  }
  const missing = countNoData(heights);
  if (missing / heights.length > MAP_NODATA_LIMIT)
    return { ok: false, message: MAP_NODATA_MESSAGE };
  if (missing > 0 && fillNoData(heights, size, size) > 0)
    return { ok: false, message: MAP_NODATA_MESSAGE };
  let minM = Infinity;
  let maxM = -Infinity;
  for (let k = 0; k < heights.length; k += 1) {
    const h = heights[k]!;
    if (h < minM) minM = h;
    if (h > maxM) maxM = h;
  }
  return { ok: true, heights, minM, maxM };
}

/** min→0, max→65535. A flat frame (range < 0.5 m) is treated as `max = min + 1`. */
export function toUint16Heights(heights: Float32Array, minM: number, maxM: number): Uint16Array {
  const hi = maxM - minM < 0.5 ? minM + 1 : maxM;
  const span = hi - minM;
  const out = new Uint16Array(heights.length);
  for (let k = 0; k < heights.length; k += 1)
    out[k] = Math.max(0, Math.min(65535, Math.round(((heights[k]! - minM) / span) * 65535)));
  return out;
}

/** Raw little-endian float32, row 0 = north edge, no header. */
export function encodeR32(heights: Float32Array): Uint8Array {
  const out = new Uint8Array(heights.length * 4);
  const view = new DataView(out.buffer);
  for (let k = 0; k < heights.length; k += 1) view.setFloat32(k * 4, heights[k]!, true);
  return out;
}
