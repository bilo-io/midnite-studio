import type { Heightfield } from './heightfield';
import type { RasterImage } from './raster';
import {
  TERRAIN_CLASSES,
  TERRAIN_CLASS_INDICES,
  type TerrainClass,
} from './classes';

export type TerrainCluster = {
  index: number;
  count: number;
  rgb: [number, number, number];
  lab: [number, number, number];
  initialClass: TerrainClass;
};

export type ClassifyOptions = {
  k?: number;
  exgThreshold?: number;
  rockSlopeDeg?: number;
  seaLevel?: number;
  seed?: number;
  overrides?: Uint8Array;
  buildingsMinAreaM2?: number;
};

export type ClassifyResult = {
  classes: Uint8Array;
  clusters: TerrainCluster[];
};

/** Convert sRGB 0..1 to CIE Lab [L*, a*, b*]. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB gamma correction to linear RGB
  const toLinear = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Linear RGB to CIE XYZ (D65 illuminant)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const bStar = 200 * (fy - fz);

  return [L, a, bStar];
}

/** PRNG (mulberry32) matching noise.ts */
function createRng(seed: number): () => number {
  let s = Math.floor(seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Classifies the aligned satellite image into land-cover classes:
 * water, tree, grass, bare, rock, road, building, other.
 *
 * Rules:
 * 1. Paint override if present.
 * 2. Excess-green (ExG) > exgThreshold -> tree (var7x7 > 0.004) or grass.
 * 3. Water: height < seaLevel && slope < 3° && var7x7 < 0.001 && Lab hue in 180°..260°.
 * 4. Rock: slope >= rockSlopeDeg.
 * 5. K-means on remaining pixels: road (low-chroma, L* 25-70), building (rectilinear), bare, other.
 */
export function classify(
  drape: RasterImage,
  field: Heightfield,
  opts: ClassifyOptions = {},
): ClassifyResult {
  const exgThreshold = opts.exgThreshold ?? 0.05;
  const rockSlopeDeg = opts.rockSlopeDeg ?? 35;
  const k = Math.min(12, Math.max(4, opts.k ?? 8));
  const seed = opts.seed ?? 1;
  const rng = createRng(seed);

  const W = drape.width;
  const H = drape.height;
  const N = W * H;

  // Extract RGBA channels
  const channels = drape.channels;
  const raw = drape.data instanceof Uint8Array ? drape.data : new Uint8Array(drape.data.buffer);

  const rBuf = new Float32Array(N);
  const gBuf = new Float32Array(N);
  const bBuf = new Float32Array(N);
  const luma = new Float32Array(N);

  for (let i = 0; i < N; i += 1) {
    const offset = i * channels;
    const r = raw[offset]! / 255;
    const g = channels >= 2 ? raw[offset + 1]! / 255 : r;
    const b = channels >= 3 ? raw[offset + 2]! / 255 : r;
    rBuf[i] = r;
    gBuf[i] = g;
    bBuf[i] = b;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Compute 7x7 luminance variance
  const var7x7 = new Float32Array(N);
  const radius = 3;
  for (let y = 0; y < H; y += 1) {
    const yMin = Math.max(0, y - radius);
    const yMax = Math.min(H - 1, y + radius);
    for (let x = 0; x < W; x += 1) {
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(W - 1, x + radius);
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let cy = yMin; cy <= yMax; cy += 1) {
        const row = cy * W;
        for (let cx = xMin; cx <= xMax; cx += 1) {
          const val = luma[row + cx]!;
          sum += val;
          sumSq += val * val;
          count += 1;
        }
      }
      const mean = sum / count;
      const v = sumSq / count - mean * mean;
      var7x7[y * W + x] = Math.max(0, v);
    }
  }

  // Pre-calculate heights and slopes from heightfield
  const fRes = field.resolution;
  const fHeights = field.heights;
  const cellM = field.worldSize / (fRes - 1);

  const sampleHeight = (u: number, v: number): number => {
    const fx = Math.max(0, Math.min(fRes - 1, u * (fRes - 1)));
    const fz = Math.max(0, Math.min(fRes - 1, v * (fRes - 1)));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(fRes - 1, x0 + 1);
    const z1 = Math.min(fRes - 1, z0 + 1);
    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = fHeights[z0 * fRes + x0]!;
    const h10 = fHeights[z0 * fRes + x1]!;
    const h01 = fHeights[z1 * fRes + x0]!;
    const h11 = fHeights[z1 * fRes + x1]!;
    return (1 - tz) * ((1 - tx) * h00 + tx * h10) + tz * ((1 - tx) * h01 + tx * h11);
  };

  const sampleSlopeDeg = (u: number, v: number): number => {
    const du = 1 / (fRes - 1);
    const hL = sampleHeight(Math.max(0, u - du), v);
    const hR = sampleHeight(Math.min(1, u + du), v);
    const hU = sampleHeight(u, Math.max(0, v - du));
    const hD = sampleHeight(u, Math.min(1, v + du));
    const dx = (hR - hL) / (2 * cellM);
    const dz = (hD - hU) / (2 * cellM);
    const grad = Math.hypot(dx, dz);
    return (Math.atan(grad) * 180) / Math.PI;
  };

  const classes = new Uint8Array(N);
  const unclassifiedIndices: number[] = [];

  const waterIdx = TERRAIN_CLASS_INDICES.water;
  const treeIdx = TERRAIN_CLASS_INDICES.tree;
  const grassIdx = TERRAIN_CLASS_INDICES.grass;
  const rockIdx = TERRAIN_CLASS_INDICES.rock;

  const overrides = opts.overrides;

  for (let y = 0; y < H; y += 1) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x += 1) {
      const idx = y * W + x;
      const u = (x + 0.5) / W;

      // 1. Paint-correction override
      if (overrides && overrides[idx]! > 0) {
        classes[idx] = Math.min(TERRAIN_CLASSES.length - 1, overrides[idx]! - 1);
        continue;
      }

      const r = rBuf[idx]!;
      const g = gBuf[idx]!;
      const b = bBuf[idx]!;
      const sumRGB = r + g + b;
      const exg = 2 * g - r - b;
      const varL = var7x7[idx]!;

      // 2. Vegetation
      if (sumRGB > 1e-4 && exg / sumRGB > exgThreshold) {
        classes[idx] = varL > 0.004 ? treeIdx : grassIdx;
        continue;
      }

      const height = sampleHeight(u, v);
      const slope = sampleSlopeDeg(u, v);

      // 3. Water: flat, smooth, grey-blue below sea level
      if (opts.seaLevel !== undefined && height < opts.seaLevel && slope < 3 && varL < 0.001) {
        const [, a, bStar] = rgbToLab(r, g, b);
        let hue = (Math.atan2(bStar, a) * 180) / Math.PI;
        if (hue < 0) hue += 360;
        if ((hue >= 180 && hue <= 300) || (bStar < 0 && hue >= 160)) {
          classes[idx] = waterIdx;
          continue;
        }
      }

      // 4. Rock
      if (slope >= rockSlopeDeg) {
        classes[idx] = rockIdx;
        continue;
      }

      // Remaining pixels go to k-means
      unclassifiedIndices.push(idx);
    }
  }

  const clusters: TerrainCluster[] = [];

  // If there are unclassified pixels, cluster them with K-Means in CIE Lab
  if (unclassifiedIndices.length > 0) {
    const unCount = unclassifiedIndices.length;
    const labX = new Float32Array(unCount);
    const labY = new Float32Array(unCount);
    const labZ = new Float32Array(unCount);

    for (let i = 0; i < unCount; i += 1) {
      const idx = unclassifiedIndices[i]!;
      const [l, a, b] = rgbToLab(rBuf[idx]!, gBuf[idx]!, bBuf[idx]!);
      labX[i] = l;
      labY[i] = a;
      labZ[i] = b;
    }

    // K-Means++ initialization
    const centroids: [number, number, number][] = [];
    const firstIdx = Math.floor(rng() * unCount);
    centroids.push([labX[firstIdx]!, labY[firstIdx]!, labZ[firstIdx]!]);

    const distSq = new Float64Array(unCount);
    for (let c = 1; c < k; c += 1) {
      let sumDist = 0;
      for (let i = 0; i < unCount; i += 1) {
        let minDist = Infinity;
        for (let j = 0; j < c; j += 1) {
          const dl = labX[i]! - centroids[j]![0];
          const da = labY[i]! - centroids[j]![1];
          const db = labZ[i]! - centroids[j]![2];
          const d = dl * dl + da * da + db * db;
          if (d < minDist) minDist = d;
        }
        distSq[i] = minDist;
        sumDist += minDist;
      }

      let target = rng() * (sumDist || 1);
      let picked = 0;
      for (let i = 0; i < unCount; i += 1) {
        target -= distSq[i]!;
        if (target <= 0) {
          picked = i;
          break;
        }
      }
      centroids.push([labX[picked]!, labY[picked]!, labZ[picked]!]);
    }

    // 20 K-Means iterations
    const assignments = new Uint8Array(unCount);
    const counts = new Uint32Array(k);
    const sumL = new Float64Array(k);
    const sumA = new Float64Array(k);
    const sumB = new Float64Array(k);

    for (let iter = 0; iter < 20; iter += 1) {
      counts.fill(0);
      sumL.fill(0);
      sumA.fill(0);
      sumB.fill(0);

      for (let i = 0; i < unCount; i += 1) {
        const lx = labX[i]!;
        const ly = labY[i]!;
        const lz = labZ[i]!;
        let bestDist = Infinity;
        let bestC = 0;
        for (let c = 0; c < k; c += 1) {
          const dl = lx - centroids[c]![0];
          const da = ly - centroids[c]![1];
          const db = lz - centroids[c]![2];
          const d = dl * dl + da * da + db * db;
          if (d < bestDist) {
            bestDist = d;
            bestC = c;
          }
        }
        assignments[i] = bestC;
        counts[bestC] = (counts[bestC] ?? 0) + 1;
        sumL[bestC] = (sumL[bestC] ?? 0) + lx;
        sumA[bestC] = (sumA[bestC] ?? 0) + ly;
        sumB[bestC] = (sumB[bestC] ?? 0) + lz;
      }

      for (let c = 0; c < k; c += 1) {
        if (counts[c]! > 0) {
          centroids[c] = [
            sumL[c]! / counts[c]!,
            sumA[c]! / counts[c]!,
            sumB[c]! / counts[c]!,
          ];
        }
      }
    }

    // Label each centroid prototype
    const clusterClasses: TerrainClass[] = [];
    for (let c = 0; c < k; c += 1) {
      const [l, a, bStar] = centroids[c]!;
      const chroma = Math.hypot(a, bStar);
      let hue = (Math.atan2(bStar, a) * 180) / Math.PI;
      if (hue < 0) hue += 360;

      let cls: TerrainClass = 'other';
      if (chroma < 12 && l >= 25 && l <= 70) {
        cls = 'road';
      } else if (chroma < 35 && ((hue >= 20 && hue <= 90) || (a > 0 && bStar > 0))) {
        cls = 'bare';
      } else if (chroma < 15 && l > 70) {
        // High lightness/contrast rectilinear or building
        cls = 'building';
      }

      clusterClasses.push(cls);

      // Convert Lab back to approximate RGB 0..255 for reporting
      const yNorm = (l + 16) / 116;
      const xNorm = a / 500 + yNorm;
      const zNorm = yNorm - bStar / 200;
      const invF = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
      const X = invF(xNorm) * 0.95047;
      const Y = invF(yNorm);
      const Z = invF(zNorm) * 1.08883;
      const rLin = X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314;
      const gLin = -X * 0.969266 + Y * 1.8760108 + Z * 0.041556;
      const bLin = X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252;
      const toSrgb = (v: number) =>
        Math.round(Math.max(0, Math.min(1, v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v)) * 255);

      clusters.push({
        index: c,
        count: counts[c]!,
        rgb: [toSrgb(rLin), toSrgb(gLin), toSrgb(bLin)],
        lab: [l, a, bStar],
        initialClass: cls,
      });
    }

    // Assign pixel classes from cluster classes
    for (let i = 0; i < unCount; i += 1) {
      const idx = unclassifiedIndices[i]!;
      const clusterId = assignments[i]!;
      classes[idx] = TERRAIN_CLASS_INDICES[clusterClasses[clusterId]!];
    }
  }

  return { classes, clusters };
}
