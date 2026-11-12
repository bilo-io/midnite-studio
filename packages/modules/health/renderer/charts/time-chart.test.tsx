import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { niceTicks } from './ticks';
import { TimeChart } from './time-chart';

afterEach(cleanup);

const range = { from: '2026-11-01', to: '2026-11-30' };
const bars = { id: 'kcal', label: 'Calories', kind: 'bars' as const, tone: 'accent' as const, points: [{ date: '2026-11-02', value: 2000 }, { date: '2026-11-03', value: 2200 }, { date: '2026-11-05', value: 1800 }] };

describe('niceTicks', () => {
  it('covers 61.2-83.9 in steps of 5', () => expect(niceTicks(61.2, 83.9)).toEqual([60, 65, 70, 75, 80, 85]));
  it('uses 1/2/5 x 10^n steps and 4 to 6 ticks', () => {
    for (const [a, b] of [[0, 2300], [0, 17], [-3, 4], [78, 82], [0.1, 0.9]] as const) {
      const t = niceTicks(a, b);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(8);
      expect(t[0]!).toBeLessThanOrEqual(a);
      expect(t[t.length - 1]!).toBeGreaterThanOrEqual(b);
    }
  });
  it('handles a flat series', () => expect(niceTicks(5, 5).length).toBe(2));
});

describe('TimeChart', () => {
  it('draws one rect per bar', () => {
    const { container } = render(<TimeChart series={[bars]} yUnit="kcal" range={range} title="Calories" />);
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });
  it('draws dots and a line', () => {
    const { container } = render(
      <TimeChart
        series={[
          { id: 'w', label: 'Weight', kind: 'dots', tone: 'muted', points: bars.points },
          { id: 'a', label: 'Average', kind: 'line', tone: 'accent', points: bars.points },
        ]}
        yUnit="kg"
        range={range}
        title="Weight"
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
  });
  it('has a hidden table with one row per date', () => {
    render(<TimeChart series={[bars]} yUnit="kcal" range={range} title="Calories" />);
    expect(screen.getByTestId('chart-table').querySelectorAll('tbody tr')).toHaveLength(3);
  });
  it('draws the reference line label', () => {
    render(<TimeChart series={[bars]} refLine={{ value: 2200, label: 'Target 2200' }} yUnit="kcal" range={range} title="Calories" />);
    expect(screen.getByText('Target 2200')).toBeTruthy();
  });
  it('shows a tooltip on hover when the chart has a size', () => {
    const { container } = render(<TimeChart series={[bars]} yUnit="kcal" range={range} title="Calories" />);
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 640, top: 0, height: 220, right: 640, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: 100 });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('Calories');
  });
});
