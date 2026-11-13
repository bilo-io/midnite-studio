import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PLOT_COLORS, PlotSvg, niceTicks } from './plot-svg';
import { samplePlot, type PlotCell } from './sample';

afterEach(cleanup);

const plot = (exprs: string[], min: number, max: number): PlotCell => ({
  kind: 'plot',
  id: 'c-aaaaaaaa',
  series: exprs.map((expr) => ({ expr })),
  x: { min, max },
  y: 'auto',
});

describe('niceTicks', () => {
  it('rounds to 1, 2, 5 steps', () => {
    expect(niceTicks(0, 10, 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe('PlotSvg', () => {
  it('breaks the path at the asymptotes of tan(x)', () => {
    const { container } = render(<PlotSvg samples={samplePlot(plot(['tan(x)'], -3, 3), new Map())} y={{ min: -5, max: 5 }} />);
    const d = container.querySelector('path')!.getAttribute('d')!;
    expect(d.match(/M/g)!.length).toBeGreaterThan(1);
  });
  it('draws one path per series in the first colours', () => {
    const { container } = render(<PlotSvg samples={samplePlot(plot(['sin(x)', 'cos(x)'], 0, 6), new Map())} y="auto" />);
    const paths = [...container.querySelectorAll('path')];
    expect(paths.map((p) => p.getAttribute('stroke'))).toEqual([PLOT_COLORS[0], PLOT_COLORS[1]]);
  });
});
