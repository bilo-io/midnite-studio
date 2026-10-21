import { TERRAIN_CLASS_INDICES } from './classes';
import type { Heightfield } from './heightfield';

export type SplatOptions = {
  rockSlopeDeg?: number;
  heightRange: [number, number];
  snowLineM?: number;
};

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes the normalized RGBA splat weights [grass, rock, dirt, snow] for a given location.
 * - R: grass (from tree/grass)
 * - G: rock (smoothstep over rockSlopeDeg - 10 .. rockSlopeDeg)
 * - B: dirt (from bare/road/building/other; water is all-dirt)
 * - A: snow (smoothstep over snowLine - 10 .. snowLine)
 *
 * Guaranteed to sum to 1 ± 1e-6.
 */
export function computeSplatWeights(
  cls: number,
  height: number,
  slopeDeg: number,
  opts: SplatOptions,
): [number, number, number, number] {
  // Water is always all-dirt
  if (cls === TERRAIN_CLASS_INDICES.water) {
    return [0, 0, 1, 0];
  }

  const rockSlopeDeg = opts.rockSlopeDeg ?? 35;
  const [minH, maxH] = opts.heightRange;
  const span = Math.max(1, maxH - minH);
  const snowLine = opts.snowLineM ?? maxH - 0.15 * span;

  const rock = smoothstep(rockSlopeDeg - 10, rockSlopeDeg, slopeDeg);
  const snow = smoothstep(snowLine - 10, snowLine, height);

  const baseGrass =
    cls === TERRAIN_CLASS_INDICES.grass || cls === TERRAIN_CLASS_INDICES.tree ? 1 : 0;
  const baseDirt = 1 - baseGrass;

  const wGrass = baseGrass * (1 - rock) * (1 - snow);
  const wDirt = baseDirt * (1 - rock) * (1 - snow);
  const wRock = rock * (1 - snow);
  const wSnow = snow;

  return [wGrass, wRock, wDirt, wSnow];
}

/**
 * Generates an RGBA8 splat map (textureSize x textureSize x 4 bytes) from land-cover classes and heightfield.
 */
export function generateSplatMap(
  classes: Uint8Array,
  classRes: number,
  field: Heightfield,
  outRes: number,
  opts: SplatOptions,
): Uint8Array {
  const rgba = new Uint8Array(outRes * outRes * 4);
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

  for (let y = 0; y < outRes; y += 1) {
    const v = (y + 0.5) / outRes;
    const cy = Math.max(0, Math.min(classRes - 1, Math.floor(v * classRes)));
    for (let x = 0; x < outRes; x += 1) {
      const u = (x + 0.5) / outRes;
      const cx = Math.max(0, Math.min(classRes - 1, Math.floor(u * classRes)));
      const cls = classes[cy * classRes + cx]!;

      const height = sampleHeight(u, v);
      const slope = sampleSlopeDeg(u, v);

      const [wGrass, wRock, wDirt, wSnow] = computeSplatWeights(cls, height, slope, opts);

      let r = Math.round(wGrass * 255);
      let g = Math.round(wRock * 255);
      let b = Math.round(wDirt * 255);
      let a = Math.round(wSnow * 255);

      // Quantization fix so byte sum is 255
      const sum = r + g + b + a;
      const diff = 255 - sum;
      if (diff !== 0) {
        if (wSnow >= wGrass && wSnow >= wRock && wSnow >= wDirt) a += diff;
        else if (wRock >= wGrass && wRock >= wDirt) g += diff;
        else if (wGrass >= wDirt) r += diff;
        else b += diff;
      }

      const idx = (y * outRes + x) * 4;
      rgba[idx] = Math.max(0, Math.min(255, r));
      rgba[idx + 1] = Math.max(0, Math.min(255, g));
      rgba[idx + 2] = Math.max(0, Math.min(255, b));
      rgba[idx + 3] = Math.max(0, Math.min(255, a));
    }
  }

  return rgba;
}
