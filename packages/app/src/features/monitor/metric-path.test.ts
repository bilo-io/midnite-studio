import { describe, expect, it } from 'vitest';

import type { MetricPoint } from '../../store/metrics-store';
import type { MetricGeometry } from './metric-geometry';
import { CHART_GEOMETRY, SPARKLINE_GEOMETRY } from './metric-geometry';
import { areaPath, cadenceBreaks, linePath, xFor, yFor } from './metric-path';

/** Round numbers, so the assertions read as geometry rather than arithmetic. */
const GEOMETRY: MetricGeometry = {
  width: 100,
  height: 50,
  strokeWidth: 1,
  areaAlpha: 0.2,
  padTop: 0,
};

const at = (values: number[], step = 2_000): MetricPoint[] =>
  values.map((value, index) => ({ value, at: index * step }));

describe('yFor', () => {
  it('maps the fixed 0-100 domain onto an inverted y axis', () => {
    expect(yFor(0, GEOMETRY)).toBe(50);
    expect(yFor(100, GEOMETRY)).toBe(0);
    expect(yFor(50, GEOMETRY)).toBe(25);
  });

  it('never rescales to the data — 40% is the same height whatever else is in the series', () => {
    // The whole point of a contract-fixed domain: two screenshots taken a
    // minute apart are comparable by eye.
    expect(yFor(40, GEOMETRY)).toBe(yFor(40, GEOMETRY));
    expect(yFor(40, GEOMETRY)).toBe(30);
  });

  it('insets the top so a 100% reading is not half-clipped by the viewBox', () => {
    expect(yFor(100, CHART_GEOMETRY)).toBe(CHART_GEOMETRY.padTop);
    expect(yFor(100, SPARKLINE_GEOMETRY)).toBe(SPARKLINE_GEOMETRY.padTop);
    expect(CHART_GEOMETRY.padTop).toBeGreaterThan(0);
  });

  it('clamps a value outside the domain rather than drawing outside the box', () => {
    expect(yFor(140, GEOMETRY)).toBe(0);
    expect(yFor(-20, GEOMETRY)).toBe(50);
  });
});

describe('xFor', () => {
  it('spreads points evenly from the left edge to the right', () => {
    expect(xFor(0, 5, GEOMETRY)).toBe(0);
    expect(xFor(2, 5, GEOMETRY)).toBe(50);
    expect(xFor(4, 5, GEOMETRY)).toBe(100);
  });

  it('puts a lone point at the right edge, where "now" is', () => {
    expect(xFor(0, 1, GEOMETRY)).toBe(100);
  });
});

describe('linePath', () => {
  it('builds M then L commands, one per point', () => {
    expect(linePath(at([0, 100]), GEOMETRY)).toBe('M0,50 L100,0');
  });

  it('is empty for an empty series, so an unreadable metric draws nothing', () => {
    // Not a flat line along the bottom — that would be the zero-fill lie the
    // whole optional-fields design exists to avoid.
    expect(linePath([], GEOMETRY)).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the line down the right edge, along the bottom and back up', () => {
    expect(areaPath(at([0, 100]), GEOMETRY)).toBe('M0,50 L100,0 L100,50 L0,50 Z');
  });

  it('closes to the floor of the box, not to the lowest value in the series', () => {
    const path = areaPath(at([80, 90]), GEOMETRY);
    expect(path.endsWith(`L${GEOMETRY.width},${GEOMETRY.height} L0,${GEOMETRY.height} Z`)).toBe(true);
  });

  it('is empty for an empty series', () => {
    expect(areaPath([], GEOMETRY)).toBe('');
  });
});

describe('cadenceBreaks', () => {
  it('finds nothing in an evenly-sampled series', () => {
    expect(cadenceBreaks(at([1, 2, 3, 4, 5, 6]), GEOMETRY)).toEqual([]);
  });

  it('marks the gap where 2s sampling became 5s', () => {
    const points: MetricPoint[] = [
      { value: 1, at: 0 },
      { value: 2, at: 2_000 },
      { value: 3, at: 4_000 },
      { value: 4, at: 9_000 },
      { value: 5, at: 14_000 },
    ];
    const breaks = cadenceBreaks(points, GEOMETRY);
    expect(breaks).toHaveLength(1);
    // Midway between index 2 (x=50) and index 3 (x=75) — the change happened
    // in the gap, not at either sample.
    expect(breaks[0]).toBe(62.5);
  });

  it('ignores the flat seed the store writes, so a fresh chart has no rule at its left edge', () => {
    // The seed pair is 1ms apart; compared naively against the first real 2s
    // interval that is a 2000x "change".
    const seeded: MetricPoint[] = [
      { value: 5, at: 999 },
      { value: 5, at: 1_000 },
      { value: 6, at: 3_000 },
      { value: 7, at: 5_000 },
      { value: 8, at: 7_000 },
    ];
    expect(cadenceBreaks(seeded, GEOMETRY)).toEqual([]);
  });

  it('tolerates ordinary timer jitter without drawing a rule for it', () => {
    const jittery: MetricPoint[] = [
      { value: 1, at: 0 },
      { value: 2, at: 2_000 },
      { value: 3, at: 4_050 },
      { value: 4, at: 5_980 },
      { value: 5, at: 8_010 },
    ];
    expect(cadenceBreaks(jittery, GEOMETRY)).toEqual([]);
  });

  it('says nothing about a series too short to have a cadence', () => {
    expect(cadenceBreaks(at([1, 2, 3]), GEOMETRY)).toEqual([]);
    expect(cadenceBreaks([], GEOMETRY)).toEqual([]);
  });

  it('skips a non-advancing interval rather than dividing by zero', () => {
    const duplicated: MetricPoint[] = [
      { value: 1, at: 0 },
      { value: 2, at: 2_000 },
      { value: 3, at: 2_000 },
      { value: 4, at: 4_000 },
      { value: 5, at: 6_000 },
    ];
    expect(() => cadenceBreaks(duplicated, GEOMETRY)).not.toThrow();
    expect(cadenceBreaks(duplicated, GEOMETRY)).toEqual([]);
  });
});
