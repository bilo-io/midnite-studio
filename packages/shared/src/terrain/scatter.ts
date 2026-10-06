import type { TerrainSpec } from '../media-terrain';
import type { Heightfield } from './heightfield';
import { createRng } from './noise';
import { distanceTransform } from './morphology';
import { DEFAULT_FOLIAGE_ASSETS } from './foliage-designs';

export const TERRAIN_FOLIAGE_MAX = 200_000;
export const FOLIAGE_CAPPED_WARNING = 'Foliage capped at 200 000 instances.';

export type FoliageScatterResult = {
  assets: string[];
  /** [assetIndex, x, y, z, yawRad, scale] */
  instances: [number, number, number, number, number, number][];
  warnings: string[];
};

/**
 * Poisson-disk foliage scatter driven by land-cover classification (Phase 105 Theme G).
 *
 * Places trees on `tree` (class 1) and grass/bushes on `grass` (class 2) using Bridson's algorithm.
 * Kept out of roads (5), buildings (6), water (0) with a safety margin in metres, and slopes steeper
 * than `slopeLimitDeg`.
 */
export function scatterFoliage(
  landcover: Uint8Array,
  lcRes: number,
  field: Heightfield,
  opts: TerrainSpec['foliage'],
): FoliageScatterResult {
  const warnings: string[] = [];
  const rng = createRng(opts.seed ?? 1);
  const worldSize = field.worldSize;

  const treeAssets = opts.assets?.tree ?? DEFAULT_FOLIAGE_ASSETS.tree;
  const grassAssets = opts.assets?.grass ?? DEFAULT_FOLIAGE_ASSETS.grass;

  // Build unified asset dictionary
  const assets: string[] = [];
  const treeIndices: number[] = [];
  for (const a of treeAssets) {
    let idx = assets.indexOf(a);
    if (idx === -1) {
      idx = assets.length;
      assets.push(a);
    }
    treeIndices.push(idx);
  }
  const grassIndices: number[] = [];
  for (const a of grassAssets) {
    let idx = assets.indexOf(a);
    if (idx === -1) {
      idx = assets.length;
      assets.push(a);
    }
    grassIndices.push(idx);
  }

  // Count pixels per class to estimate density budget
  let treePixels = 0;
  let grassPixels = 0;
  const totalPixels = lcRes * lcRes;
  for (let i = 0; i < totalPixels; i += 1) {
    const cls = landcover[i]!;
    if (cls === 1) treePixels += 1;
    else if (cls === 2) grassPixels += 1;
  }

  let treeDensity = opts.treeDensity; // per 100 m^2
  let grassDensity = opts.grassDensity; // per 100 m^2

  const totalAreaM2 = worldSize * worldSize;
  const estTrees = (treePixels / totalPixels) * (totalAreaM2 / 100) * treeDensity;
  const estGrass = (grassPixels / totalPixels) * (totalAreaM2 / 100) * grassDensity;
  const estTotal = estTrees + estGrass;

  if (estTotal > TERRAIN_FOLIAGE_MAX) {
    const scale = TERRAIN_FOLIAGE_MAX / Math.max(1, estTotal);
    treeDensity *= scale;
    grassDensity *= scale;
    warnings.push(FOLIAGE_CAPPED_WARNING);
  }

  // Precompute exclusion distance transform:
  // Exclusion classes: 0 (water), 5 (road), 6 (building)
  const nonExclusion = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) {
    const c = landcover[i]!;
    nonExclusion[i] = c === 0 || c === 5 || c === 6 ? 0 : 1;
  }
  const exclusionDt = distanceTransform(nonExclusion, lcRes, lcRes);
  const pxSizeM = worldSize / lcRes;
  const marginM = opts.margin ?? 2;

  const instances: [number, number, number, number, number, number][] = [];

  // Helper for elevation and slope
  const sampleElevationAndSlope = (
    x: number,
    z: number,
  ): { y: number; slopeDeg: number } => {
    const u = (x + worldSize / 2) / worldSize;
    const v = (z + worldSize / 2) / worldSize;
    const res = field.resolution;
    const gx = Math.max(0, Math.min(res - 1, u * (res - 1)));
    const gz = Math.max(0, Math.min(res - 1, v * (res - 1)));

    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(res - 1, x0 + 1);
    const z1 = Math.min(res - 1, z0 + 1);
    const fx = gx - x0;
    const fz = gz - z0;

    const h00 = field.heights[z0 * res + x0]!;
    const h10 = field.heights[z0 * res + x1]!;
    const h01 = field.heights[z1 * res + x0]!;
    const h11 = field.heights[z1 * res + x1]!;

    const y = (1 - fx) * (1 - fz) * h00 + fx * (1 - fz) * h10 + (1 - fx) * fz * h01 + fx * fz * h11;

    // Slope from central differences
    const xm = Math.max(0, x0 - 1);
    const xp = Math.min(res - 1, x1 + 1);
    const zm = Math.max(0, z0 - 1);
    const zp = Math.min(res - 1, z1 + 1);
    const cellM = worldSize / (res - 1);
    const dhx = (field.heights[z0 * res + xp]! - field.heights[z0 * res + xm]!) / (Math.max(1, xp - xm) * cellM);
    const dhz = (field.heights[zp * res + x0]! - field.heights[zm * res + x0]!) / (Math.max(1, zp - zm) * cellM);

    const slopeRad = Math.atan(Math.hypot(dhx, dhz));
    const slopeDeg = (slopeRad * 180) / Math.PI;

    return { y, slopeDeg };
  };

  const scaleMin = opts.scale[0];
  const scaleMax = opts.scale[1];
  const slopeLimitDeg = opts.slopeLimitDeg;

  // Run Poisson-disk scatter for a given class
  const scatterClass = (
    targetClass: number,
    density: number,
    assetPool: number[],
  ) => {
    if (density <= 0 || assetPool.length === 0) return;
    // Radius in metres: r = sqrt(100 / (density * pi))
    const r = Math.sqrt(100 / (density * Math.PI));
    const cellSize = r / Math.SQRT2;
    const gridDim = Math.ceil(worldSize / cellSize);
    const grid = new Int32Array(gridDim * gridDim).fill(-1);

    const activeList: number[] = [];
    const ptsX: number[] = [];
    const ptsZ: number[] = [];

    const getGridCoord = (coord: number): number => {
      const g = Math.floor((coord + worldSize / 2) / cellSize);
      return Math.max(0, Math.min(gridDim - 1, g));
    };

    const isCandidateValid = (cx: number, cz: number): boolean => {
      if (cx < -worldSize / 2 || cx > worldSize / 2 || cz < -worldSize / 2 || cz > worldSize / 2) {
        return false;
      }
      // Check landcover class and margin
      const u = (cx + worldSize / 2) / worldSize;
      const v = (cz + worldSize / 2) / worldSize;
      const lx = Math.max(0, Math.min(lcRes - 1, Math.floor(u * lcRes)));
      const lz = Math.max(0, Math.min(lcRes - 1, Math.floor(v * lcRes)));
      const lcIdx = lz * lcRes + lx;

      if (landcover[lcIdx] !== targetClass) return false;
      const distToExclusionM = exclusionDt[lcIdx]! * pxSizeM;
      if (distToExclusionM < marginM) return false;

      // Check slope
      const { slopeDeg } = sampleElevationAndSlope(cx, cz);
      if (slopeDeg > slopeLimitDeg) return false;

      // Check distance against neighbors in grid
      const gx = getGridCoord(cx);
      const gz = getGridCoord(cz);
      const rSq = r * r;

      const gxMin = Math.max(0, gx - 2);
      const gxMax = Math.min(gridDim - 1, gx + 2);
      const gzMin = Math.max(0, gz - 2);
      const gzMax = Math.min(gridDim - 1, gz + 2);

      for (let ny = gzMin; ny <= gzMax; ny += 1) {
        for (let nx = gxMin; nx <= gxMax; nx += 1) {
          const ptIdx = grid[ny * gridDim + nx]!;
          if (ptIdx !== -1) {
            const dx = cx - ptsX[ptIdx]!;
            const dz = cz - ptsZ[ptIdx]!;
            if (dx * dx + dz * dz < rSq) return false;
          }
        }
      }
      return true;
    };

    const addPoint = (x: number, z: number) => {
      const ptIdx = ptsX.length;
      ptsX.push(x);
      ptsZ.push(z);
      activeList.push(ptIdx);
      const gx = getGridCoord(x);
      const gz = getGridCoord(z);
      grid[gz * gridDim + gx] = ptIdx;

      const { y } = sampleElevationAndSlope(x, z);
      const yaw = rng() * Math.PI * 2;
      const scale = scaleMin + rng() * (scaleMax - scaleMin);
      const assetIdx = assetPool[Math.floor(rng() * assetPool.length)]!;
      instances.push([assetIdx, x, y, z, yaw, scale]);
    };

    // Attempt multiple random seeds across the map to cover disjoint clusters
    const maxSeedAttempts = Math.min(500, Math.max(20, Math.round(density * 20)));
    for (let s = 0; s < maxSeedAttempts; s += 1) {
      if (instances.length >= TERRAIN_FOLIAGE_MAX) break;
      const initX = (rng() - 0.5) * worldSize;
      const initZ = (rng() - 0.5) * worldSize;
      if (isCandidateValid(initX, initZ)) {
        addPoint(initX, initZ);
        // Expand from this point using Bridson
        while (activeList.length > 0 && instances.length < TERRAIN_FOLIAGE_MAX) {
          const randIdx = Math.floor(rng() * activeList.length);
          const currentPtIdx = activeList[randIdx]!;
          const px = ptsX[currentPtIdx]!;
          const pz = ptsZ[currentPtIdx]!;
          let found = false;

          for (let k = 0; k < 30; k += 1) {
            const rad = r * (1 + rng());
            const ang = rng() * Math.PI * 2;
            const candX = px + Math.cos(ang) * rad;
            const candZ = pz + Math.sin(ang) * rad;

            if (isCandidateValid(candX, candZ)) {
              addPoint(candX, candZ);
              found = true;
              break;
            }
          }

          if (!found) {
            // Remove from active list
            activeList[randIdx] = activeList[activeList.length - 1]!;
            activeList.pop();
          }
        }
      }
    }
  };

  // Scatter trees (class 1)
  scatterClass(1, treeDensity, treeIndices);

  // Scatter grass (class 2)
  scatterClass(2, grassDensity, grassIndices);

  if (instances.length >= TERRAIN_FOLIAGE_MAX && !warnings.includes(FOLIAGE_CAPPED_WARNING)) {
    warnings.push(FOLIAGE_CAPPED_WARNING);
  }

  return { assets, instances, warnings };
}
