import type { Heightfield } from './heightfield';

/**
 * Bilinear height at world `(x, z)` (metres, terrain centred on the origin), clamped to the edge.
 * Shared by the scatter, footprints, conform and road kernels (Phase 105 Themes G + H).
 */
export function sampleHeight(field: Heightfield, x: number, z: number): number {
  const { resolution: n, worldSize, heights } = field;
  const gx = Math.max(0, Math.min(n - 1, ((x + worldSize / 2) / worldSize) * (n - 1)));
  const gz = Math.max(0, Math.min(n - 1, ((z + worldSize / 2) / worldSize) * (n - 1)));
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(n - 1, x0 + 1);
  const z1 = Math.min(n - 1, z0 + 1);
  const fx = gx - x0;
  const fz = gz - z0;
  const h00 = heights[z0 * n + x0]!;
  const h10 = heights[z0 * n + x1]!;
  const h01 = heights[z1 * n + x0]!;
  const h11 = heights[z1 * n + x1]!;
  return (1 - fz) * ((1 - fx) * h00 + fx * h10) + fz * ((1 - fx) * h01 + fx * h11);
}

/** World position of grid vertex `(gx, gz)`. */
export function gridToWorld(field: Pick<Heightfield, 'resolution' | 'worldSize'>, gx: number, gz: number): [number, number] {
  const cell = field.worldSize / (field.resolution - 1);
  return [-field.worldSize / 2 + gx * cell, -field.worldSize / 2 + gz * cell];
}

/** World position of the centre of pixel `(px, py)` in a `res`² raster covering the terrain. */
export function pixelToWorld(px: number, py: number, res: number, worldSize: number): [number, number] {
  return [((px + 0.5) / res - 0.5) * worldSize, ((py + 0.5) / res - 0.5) * worldSize];
}
