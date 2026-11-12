// vitest/jsdom: the sparkline is plain SVG, so DOM queries are enough.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Sparkline } from './sparkline';

afterEach(cleanup);

describe('Sparkline', () => {
  it('renders one polyline per series', () => {
    const { container } = render(
      <Sparkline
        series={[
          { label: 'Prey', color: '#22c55e', values: [1, 4, 2, 8] },
          { label: 'Predators', color: '#ef4444', values: [1, 1, 2, 3] },
        ]}
      />,
    );
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('draws nothing for an empty series and does not throw', () => {
    const { container } = render(<Sparkline series={[{ label: 'Prey', color: '#22c55e', values: [] }]} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(() => render(<Sparkline series={[]} />)).not.toThrow();
  });

  it('shares one y-scale, so the smaller series sits lower', () => {
    const { container } = render(
      <Sparkline
        height={100}
        series={[
          { label: 'big', color: '#000', values: [10, 10] },
          { label: 'small', color: '#000', values: [1, 1] },
        ]}
      />,
    );
    const y = (label: string) => Number(container.querySelector(`[data-series="${label}"]`)!.getAttribute('points')!.split(' ')[0]!.split(',')[1]);
    expect(y('small')).toBeGreaterThan(y('big'));
  });
});
