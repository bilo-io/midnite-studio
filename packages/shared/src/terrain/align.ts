import type { TerrainAlignment } from '../media-terrain';

/**
 * 3x3 matrix in row-major order:
 * [m00, m01, m02,
 *  m10, m11, m12,
 *  m20, m21, m22]
 */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const DEFAULT_ALIGNMENT: TerrainAlignment = {
  offset: [0, 0],
  scale: [1, 1],
  rotationDeg: 0,
};

/**
 * Computes the 3x3 affine matrix transforming image UV [u, v, 1]^T to terrain UV [u', v', 1]^T.
 * Operations:
 * 1. Center image UV at origin (-0.5, -0.5)
 * 2. Scale by [scaleX, scaleZ]
 * 3. Rotate by rotationDeg (degrees counter-clockwise in UV space)
 * 4. Translate back to center (+0.5, +0.5)
 * 5. Translate by offset [offsetX, offsetZ]
 */
export function alignmentMatrix(a: TerrainAlignment = DEFAULT_ALIGNMENT): Mat3 {
  const [sx, sz] = a.scale ?? [1, 1];
  const [ox, oz] = a.offset ?? [0, 0];
  const rad = ((a.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const m00 = sx * cos;
  const m01 = -sz * sin;
  const m02 = 0.5 + ox - 0.5 * sx * cos + 0.5 * sz * sin;

  const m10 = sx * sin;
  const m11 = sz * cos;
  const m12 = 0.5 + oz - 0.5 * sx * sin - 0.5 * sz * cos;

  return [m00, m01, m02, m10, m11, m12, 0, 0, 1];
}

/** Maps image UV [u, v] in [0, 1] to terrain UV [u', v']. */
export function imageUvToTerrain(u: number, v: number, a: TerrainAlignment = DEFAULT_ALIGNMENT): [number, number] {
  const [sx, sz] = a.scale ?? [1, 1];
  const [ox, oz] = a.offset ?? [0, 0];
  const rad = ((a.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const uc = (u - 0.5) * sx;
  const vc = (v - 0.5) * sz;

  const ur = uc * cos - vc * sin;
  const vr = uc * sin + vc * cos;

  return [ur + 0.5 + ox, vr + 0.5 + oz];
}

/** Maps terrain UV [u', v'] in [0, 1] back to image UV [u, v]. */
export function terrainToImageUv(u: number, v: number, a: TerrainAlignment = DEFAULT_ALIGNMENT): [number, number] {
  const [sx, sz] = a.scale ?? [1, 1];
  const [ox, oz] = a.offset ?? [0, 0];
  const rad = ((a.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const ur = u - 0.5 - ox;
  const vr = v - 0.5 - oz;

  // Invert rotation (by -rad)
  const uc = ur * cos + vr * sin;
  const vc = -ur * sin + vr * cos;

  // Invert scale and center
  const imgU = uc / (sx || 1e-6) + 0.5;
  const imgV = vc / (sz || 1e-6) + 0.5;

  return [imgU, imgV];
}
