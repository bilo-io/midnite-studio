/**
 * Measuring on the WGS84 ellipsoid (Phase 108 Theme G): geodesic circles and polygon areas, on top of
 * the kernel's Vincenty `direct`/`inverse`. Shared so the renderer's tools and main's `map_measure`
 * return the same numbers.
 */
import { toFrame } from './frame';
import { direct, inverse, pathLengthM, type LonLat } from './geodesy';

/** Polygons wider than this are refused: the tangent-plane area drifts past a few tenths of a percent. */
export const MAX_AREA_EXTENT_M = 200_000;
export const MIN_CIRCLE_RADIUS_M = 1;
export const MAX_CIRCLE_RADIUS_M = 2_000_000;
export const CIRCLE_VERTICES = 128;

/** Distance of each leg of a path, metres. */
export function pathLegsM(points: readonly LonLat[]): number[] {
  const legs: number[] = [];
  for (let i = 1; i < points.length; i += 1) legs.push(inverse(points[i - 1]!, points[i]!).distanceM);
  return legs;
}

/** A closed ring (first === last) of `n` points, each exactly `radiusM` from `center` along the ellipsoid. */
export function geodesicCircle(center: LonLat, radiusM: number, n = CIRCLE_VERTICES): LonLat[] {
  const r = Math.min(MAX_CIRCLE_RADIUS_M, Math.max(MIN_CIRCLE_RADIUS_M, radiusM));
  const ring: LonLat[] = [];
  for (let i = 0; i < n; i += 1) ring.push(direct(center, (360 * i) / n, r));
  ring.push([ring[0]![0], ring[0]![1]]);
  return ring;
}

export interface PolygonMeasure {
  areaM2: number;
  perimeterM: number;
}

const ringOpen = (ring: readonly LonLat[]): LonLat[] => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring];
};

/**
 * Area and perimeter of a ring (open or closed). The ring is projected onto the azimuthal-equidistant
 * frame at its vertex centroid and the shoelace formula is applied; `null` when it spans more than
 * {@link MAX_AREA_EXTENT_M} or has fewer than three vertices.
 */
export function polygonMeasure(ring: readonly LonLat[]): PolygonMeasure | null {
  const pts = ringOpen(ring);
  if (pts.length < 3) return null;
  const centre: LonLat = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const xy = pts.map((p) => toFrame(centre, p));
  const xs = xy.map((p) => p[0]);
  const zs = xy.map((p) => p[1]);
  if (Math.max(...xs) - Math.min(...xs) > MAX_AREA_EXTENT_M || Math.max(...zs) - Math.min(...zs) > MAX_AREA_EXTENT_M) return null;
  let twice = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const [x1, z1] = xy[i]!;
    const [x2, z2] = xy[(i + 1) % xy.length]!;
    twice += x1 * z2 - x2 * z1;
  }
  return { areaM2: Math.abs(twice) / 2, perimeterM: pathLengthM([...pts, pts[0]!]) };
}
