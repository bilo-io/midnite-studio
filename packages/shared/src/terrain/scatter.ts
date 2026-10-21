import type { TerrainSpec } from '../media-terrain';
import type { Heightfield } from './heightfield';
import { createRng } from './noise';
import { distanceTransform } from './morphology';
import { TERRAIN_CLASS_INDICES } from './classes';
import { sampleHeight } from './field-sample';
import { DEFAULT_FOLIAGE_ASSETS } from './foliage-designs';

const TREE = TERRAIN_CLASS_INDICES.tree;
const GRASS = TERRAIN_CLASS_INDICES.grass;
const EXCLUDED = new Set([TERRAIN_CLASS_INDICES.water, TERRAIN_CLASS_INDICES.road, TERRAIN_CLASS_INDICES.building]);

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
 * Places trees on `tree` and grass/bushes on `grass` using Bridson's algorithm.
 * Kept out of `road`, `building` and `water` (plus any `exclude` mask) with a safety margin in metres, and slopes steeper
 * than `slopeLimitDeg`.
 */
export function scatterFoliage(
  landcover: Uint8Array,
  lcRes: number,
  field: Heightfield,
  opts: TerrainSpec['foliage'],
  /** Extra exclusion at the land cover's resolution (non-zero = keep out), e.g. the roads mask (Theme H). */
  exclude?: Uint8Array,
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
    if (cls === TREE) treePixels += 1;
    else if (cls === GRASS) grassPixels += 1;
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

  // Distance (in land-cover pixels) to the nearest water, road or building texel, or `exclude` pixel.
  const nonExclusion = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) {
    nonExclusion[i] = EXCLUDED.has(landcover[i]!) || (exclude !== undefined && exclude[i]! > 0) ? 0 : 1;
  }
  const exclusionDt = distanceTransform(nonExclusion, lcRes, lcRes);
  const pxSizeM = worldSize / lcRes;
  const marginM = opts.margin ?? 2;

  const instances: [number, number, number, number, number, number][] = [];

  const res = field.resolution;
  const cellM = worldSize / (res - 1);
  /** Squared gradient magnitude (rise over run) at a world point, from central differences on the grid. */
  const gradientSq = (x: number, z: number): number => {
    const gx = Math.max(0, Math.min(res - 1, ((x + worldSize / 2) / worldSize) * (res - 1)));
    const gz = Math.max(0, Math.min(res - 1, ((z + worldSize / 2) / worldSize) * (res - 1)));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const xm = Math.max(0, x0 - 1);
    const xp = Math.min(res - 1, x0 + 2);
    const zm = Math.max(0, z0 - 1);
    const zp = Math.min(res - 1, z0 + 2);
    const dhx = (field.heights[z0 * res + xp]! - field.heights[z0 * res + xm]!) / (Math.max(1, xp - xm) * cellM);
    const dhz = (field.heights[zp * res + x0]! - field.heights[zm * res + x0]!) / (Math.max(1, zp - zm) * cellM);
    return dhx * dhx + dhz * dhz;
  };

  const scaleMin = opts.scale[0];
  const scaleMax = opts.scale[1];
  // Compare gradients against tan(limit) rather than taking atan per candidate; ≥ 90° is no limit at all.
  const slopeLimitDeg = opts.slopeLimitDeg;
  const maxGradientSq = slopeLimitDeg >= 90 ? Infinity : Math.tan((Math.max(0, slopeLimitDeg) * Math.PI) / 180) ** 2;

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
      // Zero is *on* an excluded texel, which margin 0 must still refuse.
      const distToExclusionM = exclusionDt[lcIdx]! * pxSizeM;
      if (distToExclusionM === 0 || distToExclusionM < marginM) return false;

      // Check distance against neighbours in the grid (cheap) before the slope (not)
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
      return gradientSq(cx, cz) <= maxGradientSq;
    };

    const addPoint = (x: number, z: number) => {
      const ptIdx = ptsX.length;
      ptsX.push(x);
      ptsZ.push(z);
      activeList.push(ptIdx);
      const gx = getGridCoord(x);
      const gz = getGridCoord(z);
      grid[gz * gridDim + gx] = ptIdx;

      const y = sampleHeight(field, x, z);
      const yaw = rng() * Math.PI * 2;
      const scale = scaleMin + rng() * (scaleMax - scaleMin);
      const assetIdx = assetPool[Math.floor(rng() * assetPool.length)]!;
      instances.push([assetIdx, x, y, z, yaw, scale]);
    };

    // Seed from random texels *of this class* (not random map points), so every disjoint patch — a
    // copse, a lawn — gets a chance to start a Bridson front however small a share of the map it is.
    const classPixels: number[] = [];
    for (let i = 0; i < totalPixels; i += 1) if (landcover[i] === targetClass) classPixels.push(i);
    const maxSeedAttempts = Math.min(classPixels.length, 4000);
    for (let s = 0; s < maxSeedAttempts; s += 1) {
      if (instances.length >= TERRAIN_FOLIAGE_MAX) break;
      const px = classPixels[Math.floor(rng() * classPixels.length)]!;
      const initX = (((px % lcRes) + rng()) / lcRes - 0.5) * worldSize;
      const initZ = ((Math.floor(px / lcRes) + rng()) / lcRes - 0.5) * worldSize;
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

  scatterClass(TREE, treeDensity, treeIndices);
  scatterClass(GRASS, grassDensity, grassIndices);

  if (instances.length >= TERRAIN_FOLIAGE_MAX && !warnings.includes(FOLIAGE_CAPPED_WARNING)) {
    warnings.push(FOLIAGE_CAPPED_WARNING);
  }

  return { assets, instances, warnings };
}

/** Re-seats every instance on the field's surface — the buildings stage flattens after the scatter runs. */
export function reseatFoliage(
  instances: FoliageScatterResult['instances'],
  field: Heightfield,
): FoliageScatterResult['instances'] {
  return instances.map(([asset, x, , z, yaw, scale]) => [asset, x, sampleHeight(field, x, z), z, yaw, scale]);
}
