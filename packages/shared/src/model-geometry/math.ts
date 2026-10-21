/**
 * Small vector / matrix helpers for the model geometry kernel. Pure and dependency-free so the
 * same code runs in main (files, previews), the renderer (the live editor) and bare vitest.
 *
 * Matrices are **row-major 4×4** (`m[row * 4 + col]`), acting on column vectors: `p' = M · p`.
 */

export type Vec3 = [number, number, number];
export type Mat4 = number[];

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 => {
    const len = Math.hypot(a[0], a[1], a[2]);
    return len < 1e-12 ? fallback : [a[0] / len, a[1] / len, a[2] / len];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export const AXES = { x: 0, y: 1, z: 2 } as const;
export type AxisName = keyof typeof AXES;

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[r * 4 + k]! * b[k * 4 + c]!;
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

export const translation = (t: Vec3): Mat4 => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1];

/** Euler XYZ degrees → 3×3 row-major, matching three.js `Euler(x, y, z, 'XYZ')` (`R = Rx·Ry·Rz`). */
export function rotationMatrix(degrees: Vec3): number[] {
  const [x, y, z] = degrees.map((d) => (d * Math.PI) / 180) as Vec3;
  const [a, b] = [Math.cos(x), Math.sin(x)];
  const [c, d] = [Math.cos(y), Math.sin(y)];
  const [e, f] = [Math.cos(z), Math.sin(z)];
  return [c * e, -c * f, d, b * d * e + a * f, -b * d * f + a * e, -b * c, -a * d * e + b * f, a * d * f + b * e, a * c];
}

/** `T(position) · R · S · T(-pivot)` — how a part's own space becomes its parent's. */
export function composeLocal(position: Vec3, rotation: Vec3, scale: Vec3, pivot: Vec3 = [0, 0, 0]): Mat4 {
  const r = rotationMatrix(rotation);
  const m = identity();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) m[row * 4 + col] = r[row * 3 + col]! * scale[col]!;
  }
  // translation = position - (R·S)·pivot
  for (let row = 0; row < 3; row += 1) {
    m[row * 4 + 3] = position[row]! - (m[row * 4]! * pivot[0] + m[row * 4 + 1]! * pivot[1] + m[row * 4 + 2]! * pivot[2]);
  }
  return m;
}

export function applyPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!,
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!,
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!,
  ];
}

export function applyDirection(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2],
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2],
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2],
  ];
}

/** Determinant of the upper-left 3×3 — negative when the transform mirrors. */
export function determinant3(m: Mat4): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!)
  );
}

/** General 4×4 inverse (cofactor form); the identity for a singular matrix. */
export function invert(m: Mat4): Mat4 {
  const a = m;
  const inv = new Array<number>(16).fill(0);
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!;
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!;
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!;
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!;
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!;
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!;
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!;
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!;
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!;
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!;
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!;
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!;
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!;
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!;
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!;
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  if (Math.abs(det) < 1e-300) return identity();
  return inv.map((value) => value / det);
}

/** The row-major 3×3 inverse-transpose of a matrix's rotation/scale part — what a normal transforms by. */
export function normalMatrix(m: Mat4): number[] {
  const inv = invert(m);
  // transpose of the upper-left 3×3 of the inverse
  return [inv[0]!, inv[4]!, inv[8]!, inv[1]!, inv[5]!, inv[9]!, inv[2]!, inv[6]!, inv[10]!];
}

export function applyNormal(n3: number[], v: Vec3): Vec3 {
  return v3.norm([
    n3[0]! * v[0] + n3[1]! * v[1] + n3[2]! * v[2],
    n3[3]! * v[0] + n3[4]! * v[1] + n3[5]! * v[2],
    n3[6]! * v[0] + n3[7]! * v[1] + n3[8]! * v[2],
  ]);
}

/** Euler XYZ degrees from a pure rotation 3×3 (row-major) — the inverse of {@link rotationMatrix}. */
export function eulerFromRotation(r: number[]): Vec3 {
  const m13 = Math.max(-1, Math.min(1, r[2]!));
  const y = Math.asin(m13);
  let x: number;
  let z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-r[5]!, r[8]!);
    z = Math.atan2(-r[1]!, r[0]!);
  } else {
    x = Math.atan2(r[7]!, r[4]!);
    z = 0;
  }
  return [x, y, z].map((rad) => (rad * 180) / Math.PI) as Vec3;
}

/**
 * Splits a transform back into `position` (the matrix's translation), Euler `rotation` and `scale`.
 * A mirroring matrix (negative determinant) puts the sign on `scale.x`.
 */
export function decompose(m: Mat4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  let sx = Math.hypot(m[0]!, m[4]!, m[8]!);
  const sy = Math.hypot(m[1]!, m[5]!, m[9]!);
  const sz = Math.hypot(m[2]!, m[6]!, m[10]!);
  if (determinant3(m) < 0) sx = -sx;
  const safe = (s: number): number => (Math.abs(s) < 1e-12 ? 1 : s);
  const [ix, iy, iz] = [safe(sx), safe(sy), safe(sz)];
  const r = [m[0]! / ix, m[1]! / iy, m[2]! / iz, m[4]! / ix, m[5]! / iy, m[6]! / iz, m[8]! / ix, m[9]! / iy, m[10]! / iz];
  return { position: [m[3]!, m[7]!, m[11]!], rotation: eulerFromRotation(r), scale: [sx, sy, sz] };
}
