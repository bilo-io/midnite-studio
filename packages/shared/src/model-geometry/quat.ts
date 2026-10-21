import { type Mat4, type Vec3, v3 } from './math';

/** A unit quaternion in glTF order: `[x, y, z, w]`. */
export type Quat = [number, number, number, number];

export const qIdentity = (): Quat => [0, 0, 0, 1];

/** `a ⊗ b` — apply `b` first, then `a`. */
export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len < 1e-12 ? qIdentity() : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export const qConjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

/** Rotation of `radians` about `axis` (normalised here). */
export function qAxisAngle(axis: Vec3, radians: number): Quat {
  const n = v3.norm(axis);
  const s = Math.sin(radians / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(radians / 2)];
}

/** Euler XYZ degrees, the same convention as a part's `rotation` (`R = Rx·Ry·Rz`, three.js `'XYZ'`). */
export function qFromEulerDeg(deg: Vec3): Quat {
  const [x, y, z] = deg.map((d) => (d * Math.PI) / 180) as Vec3;
  return qMul(qMul(qAxisAngle([1, 0, 0], x), qAxisAngle([0, 1, 0], y)), qAxisAngle([0, 0, 1], z));
}

/** Euler XYZ degrees of a quaternion — the inverse of {@link qFromEulerDeg}. */
export function qToEulerDeg(q: Quat): Vec3 {
  const m = qToMat3(q);
  const m13 = Math.max(-1, Math.min(1, m[2]!));
  const y = Math.asin(m13);
  let x: number;
  let z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m[5]!, m[8]!);
    z = Math.atan2(-m[1]!, m[0]!);
  } else {
    x = Math.atan2(m[7]!, m[4]!);
    z = 0;
  }
  return [x, y, z].map((r) => (r * 180) / Math.PI) as Vec3;
}

export function qRotate(q: Quat, v: Vec3): Vec3 {
  const m = qToMat3(q);
  return [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
}

/** Row-major 3×3. */
export function qToMat3(q: Quat): number[] {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

/** `T(t) · R(q)`, row-major. */
export function trsMatrix(t: Vec3, q: Quat): Mat4 {
  const r = qToMat3(q);
  return [r[0]!, r[1]!, r[2]!, t[0], r[3]!, r[4]!, r[5]!, t[1], r[6]!, r[7]!, r[8]!, t[2], 0, 0, 0, 1];
}

export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
  }
  if (cos > 0.9995) return qNormalize([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}
