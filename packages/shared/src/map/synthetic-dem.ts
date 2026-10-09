/** Deterministic synthetic Terrarium tiles — fixtures for the no-network goldens (shared and desktop tests). */
import { encodeTerrarium } from './dem';

export const TILE = 256;

/**
 * RGBA tile at (z, x, y) whose height at each pixel is `heightAt(lon, lat)`. Pixel centres are
 * placed exactly as Web-Mercator tiles are, so decode + resample should recover `heightAt`.
 */
export function syntheticTile(
  z: number,
  x: number,
  y: number,
  heightAt: (lon: number, lat: number) => number,
): Uint8Array {
  const rgba = new Uint8Array(TILE * TILE * 4);
  const n = 2 ** z;
  for (let py = 0; py < TILE; py += 1) {
    for (let px = 0; px < TILE; px += 1) {
      const wx = (x + (px + 0.5) / TILE) / n;
      const wy = (y + (py + 0.5) / TILE) / n;
      const lon = wx * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) * 180) / Math.PI;
      const [r, g, b] = encodeTerrarium(heightAt(lon, lat));
      const o = (py * TILE + px) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}
