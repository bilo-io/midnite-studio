/**
 * The capture's local frame: an azimuthal-equidistant projection about the frame centre, so the
 * output square is in true metres whatever the latitude (Phase 108 Decision 3). Axes follow Terrain:
 * `x` east, `z` SOUTH, both centred on the frame centre. Distance from the centre is exact.
 */
import { direct, inverse, type LonLat } from './geodesy';

export interface CaptureFrame {
  center: LonLat;
  sideM: number;
}

export function fromFrame(center: LonLat, [x, z]: readonly [number, number]): LonLat {
  const dist = Math.hypot(x, z);
  if (dist === 0) return [center[0], center[1]];
  return direct(center, (Math.atan2(x, -z) * 180) / Math.PI, dist);
}

export function toFrame(center: LonLat, p: LonLat): [number, number] {
  const { distanceM, azi1 } = inverse(center, p);
  const a = (azi1 * Math.PI) / 180;
  return [distanceM * Math.sin(a), -distanceM * Math.cos(a)];
}

/**
 * Closed outline of the square, clockwise from the north-west corner, `perSide` segments per side
 * (so `4·perSide + 1` points, first === last). A projected square, not a screen rectangle.
 */
export function frameRing(center: LonLat, sideM: number, perSide = 16): LonLat[] {
  const h = sideM / 2;
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const ring: LonLat[] = [];
  for (let c = 0; c < 4; c += 1) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    for (let i = 0; i < perSide; i += 1) {
      const t = i / perSide;
      ring.push(fromFrame(center, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
  }
  ring.push(ring[0]!);
  return ring;
}

/** `[west, south, east, north]` enclosing the whole square. */
export function frameBBox(center: LonLat, sideM: number): [number, number, number, number] {
  const ring = frameRing(center, sideM, 8);
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}
