/**
 * Which tiles a capture needs, and at what zoom. `chooseCaptureZoom` is Phase 108 Decision 21: the
 * deepest zoom that is still *useful* for the output metres-per-pixel, inside a tile budget.
 */
import { frameRing, type CaptureFrame } from './frame';
import { lonLatToWorld, nativeMPerPx } from './mercator';

export const MAP_CAPTURE_TILE_BUDGET = 1024;
/** Pixels of margin around the frame so bicubic sampling never reads past the mosaic. */
const MARGIN_PX = 3;

export interface ZoomSource {
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

export interface TilePlan {
  z: number;
  tileSize: number;
  /** First tile column / row and how many of each. */
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  count: number;
}

export interface PlannedTile {
  x: number;
  y: number;
}

/** The tiles at zoom `z` that cover the frame (plus a small margin). */
export function planTiles(frame: CaptureFrame, z: number, tileSize: number): TilePlan {
  const n = 2 ** z;
  const scale = n * tileSize;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lon, lat] of frameRing(frame.center, frame.sideM, 8)) {
    const [wx, wy] = lonLatToWorld(lon, lat);
    minX = Math.min(minX, wx * scale);
    maxX = Math.max(maxX, wx * scale);
    minY = Math.min(minY, wy * scale);
    maxY = Math.max(maxY, wy * scale);
  }
  const tx0 = Math.max(0, Math.floor((minX - MARGIN_PX) / tileSize));
  const tx1 = Math.min(n - 1, Math.floor((maxX + MARGIN_PX) / tileSize));
  const ty0 = Math.max(0, Math.floor((minY - MARGIN_PX) / tileSize));
  const ty1 = Math.min(n - 1, Math.floor((maxY + MARGIN_PX) / tileSize));
  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  return { z, tileSize, x0: tx0, y0: ty0, cols, rows, count: cols * rows };
}

export function listTiles(plan: TilePlan): PlannedTile[] {
  const out: PlannedTile[] = [];
  for (let r = 0; r < plan.rows; r += 1)
    for (let c = 0; c < plan.cols; c += 1) out.push({ x: plan.x0 + c, y: plan.y0 + r });
  return out;
}

/**
 * Start at `source.maxZoom` and step down while deeper is wasted (the tile's native m/px is finer
 * than half the output m/px) or the tile count exceeds `budget`; never below `source.minZoom`.
 * `size` is the output's pixel count per side (vertex grid: pitch is `sideM / (size − 1)`).
 */
export function chooseCaptureZoom(
  source: ZoomSource,
  frame: CaptureFrame,
  size: number,
  opts: { budget?: number; pitched?: boolean } = {},
): TilePlan {
  const budget = opts.budget ?? MAP_CAPTURE_TILE_BUDGET;
  const target = opts.pitched === false ? frame.sideM / size : frame.sideM / (size - 1);
  const lat = frame.center[1];
  let z = source.maxZoom;
  let plan = planTiles(frame, z, source.tileSize);
  while (z > source.minZoom) {
    const wasted = nativeMPerPx(z, lat, source.tileSize) < target / 2;
    if (!wasted && plan.count <= budget) break;
    z -= 1;
    plan = planTiles(frame, z, source.tileSize);
  }
  return plan;
}
