import { describe, expect, it } from 'vitest';

import { autoRange, samplePlot, type PlotCell } from './sample';

const cell = (expr: string, min: number, max: number): PlotCell => ({
  kind: 'plot',
  id: 'c-aaaaaaaa',
  series: [{ expr }],
  x: { min, max },
  y: 'auto',
});

describe('samplePlot', () => {
  it('samples sin(x) 512 times within [-1, 1]', () => {
    const { xs, series } = samplePlot(cell('sin(x)', 0, 2 * Math.PI), new Map());
    expect(xs).toHaveLength(512);
    expect(series[0]!.ys).toHaveLength(512);
    for (const y of series[0]!.ys) expect(Math.abs(y)).toBeLessThanOrEqual(1);
  });
  it('gives NaN at a pole and for a non-real value', () => {
    const inv = samplePlot(cell('1/x', -1, 1), new Map()).series[0]!.ys;
    expect(inv.some((y) => !Number.isFinite(y)) || inv.some((y, i) => i > 0 && Math.sign(y) !== Math.sign(inv[i - 1]!))).toBe(true);
    expect(samplePlot(cell('sqrt(x)', -2, -1), new Map()).series[0]!.ys.every(Number.isNaN)).toBe(true);
  });
  it('reads variables from the notebook scope', () => {
    const { series } = samplePlot(cell('k*x', 0, 1), new Map([['k', 2]]));
    expect(series[0]!.ys.at(-1)).toBeCloseTo(2);
  });
  it('turns a bad expression into NaN, not a throw', () => {
    expect(samplePlot(cell('1 +', 0, 1), new Map()).series[0]!.ys.every(Number.isNaN)).toBe(true);
  });
});

describe('autoRange', () => {
  it('pads a flat series by one either side', () => {
    expect(autoRange([3, 3, 3])).toEqual({ min: 2, max: 4 });
  });
  it('ignores outliers beyond the 98th percentile', () => {
    const ys = Array.from({ length: 100 }, (_, i) => i);
    ys[50] = 1e9;
    expect(autoRange(ys).max).toBeLessThan(200);
  });
});
