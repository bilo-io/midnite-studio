import { describe, expect, it } from 'vitest';

import { direct, inverse, type LonLat } from './geodesy';
import { geodesicCircle, MAX_AREA_EXTENT_M, pathLegsM, polygonMeasure } from './measure';

describe('measure', () => {
  it('London to New York is about 5 585 km', () => {
    const d = inverse([-0.1278, 51.5074], [-74.006, 40.7128]).distanceM;
    expect(Math.abs(d - 5_585_000)).toBeLessThan(1000);
  });
  it('legs sum to the path', () => {
    const legs = pathLegsM([[0, 0], [1, 0], [1, 1]]);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toBeCloseTo(111_319.49, 0);
  });
  it('every vertex of a 10 km circle at lat 60 is 10 000 m from the centre', () => {
    const c: LonLat = [24, 60];
    const ring = geodesicCircle(c, 10_000);
    expect(ring).toHaveLength(129);
    expect(ring[0]).toEqual(ring[128]);
    for (const p of ring) expect(Math.abs(inverse(c, p).distanceM - 10_000)).toBeLessThan(0.01);
  });
  it('a 1 x 1 degree quad at the equator is about 12 308 km2', () => {
    const m = polygonMeasure([[0, 0], [1, 0], [1, 1], [0, 1]])!;
    expect(Math.abs(m.areaM2 / 1e6 - 12_308) / 12_308).toBeLessThan(0.005);
    expect(m.perimeterM).toBeGreaterThan(440_000);
  });
  it('a closed ring measures the same as an open one; tiny and huge rings are refused', () => {
    const open: LonLat[] = [[0, 0], [0.01, 0], [0.01, 0.01]];
    expect(polygonMeasure([...open, open[0]!])!.areaM2).toBeCloseTo(polygonMeasure(open)!.areaM2, 3);
    expect(polygonMeasure([[0, 0], [1, 1]])).toBeNull();
    expect(polygonMeasure([[0, 0], [3, 0], [3, 3], [0, 3]])).toBeNull();
    expect(MAX_AREA_EXTENT_M).toBe(200_000);
  });
  it('a circle polygon area is close to pi r2', () => {
    const m = polygonMeasure(geodesicCircle([10, 45], 5000))!;
    expect(Math.abs(m.areaM2 - Math.PI * 25e6) / (Math.PI * 25e6)).toBeLessThan(0.002);
    expect(direct([0, 0], 90, 1000)[0]).toBeGreaterThan(0);
  });
});
