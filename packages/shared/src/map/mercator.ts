/**
 * Web-Mercator (EPSG:3857) and slippy-tile maths. Dependency-free: `shared` is zod-only and this
 * file runs in main, in the capture worker and under bare vitest.
 *
 * "World" coordinates are the unit square: `x` 0 at lon −180 → 1 at +180, `y` 0 at the north edge
 * (lat ≈ +85.0511) → 1 at the south edge. Multiply by `2^z · tileSize` for a pixel at zoom `z`.
 */
export const MERCATOR_MAX_LAT = 85.0511287798066;
/** Equatorial circumference of the WGS84 sphere Web-Mercator uses, in metres. */
export const MERCATOR_EQUATOR_M = 40_075_016.68557849;

const DEG = Math.PI / 180;

export function clampLat(lat: number): number {
  return Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
}

export function lonLatToWorld(lon: number, lat: number): [number, number] {
  const s = Math.sin(clampLat(lat) * DEG);
  const x = (lon + 180) / 360;
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

export function worldToLonLat(x: number, y: number): [number, number] {
  const lon = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lon, lat];
}

export interface TileCoord {
  x: number;
  y: number;
}

export function tileForLonLat(lon: number, lat: number, z: number): TileCoord {
  const n = 2 ** z;
  const [wx, wy] = lonLatToWorld(lon, lat);
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(wx * n))),
    y: Math.max(0, Math.min(n - 1, Math.floor(wy * n))),
  };
}

/** `[west, south, east, north]` of one tile, in degrees. */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const [w, north] = worldToLonLat(x / n, y / n);
  const [e, south] = worldToLonLat((x + 1) / n, (y + 1) / n);
  return [w, south, e, north];
}

/** Ground metres covered by one pixel at `lat` (Mercator's scale shrinks with cos(lat)). */
export function nativeMPerPx(z: number, lat: number, tileSize = 256): number {
  return (MERCATOR_EQUATOR_M * Math.cos(clampLat(lat) * DEG)) / (tileSize * 2 ** z);
}
