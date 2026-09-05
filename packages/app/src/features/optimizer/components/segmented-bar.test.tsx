import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SegmentedBar } from './segmented-bar';

describe('SegmentedBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders segment widths that sum to 100% of the track', () => {
    const { container } = render(
      <SegmentedBar
        label="Storage"
        total={100}
        segments={[
          { id: 'nodeModules', bytes: 40 },
          { id: 'buildOutput', bytes: 60 },
        ]}
      />,
    );
    const widths = [...container.querySelectorAll('div[style]')].map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths).toEqual(['40%', '60%']);
  });

  it('renders an empty track rather than NaN when total is zero', () => {
    const { container } = render(
      <SegmentedBar label="Storage" total={0} segments={[{ id: 'nodeModules', bytes: 10 }]} />,
    );
    expect(container.querySelectorAll('div[style]')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('scales segments down proportionally when they sum above total', () => {
    const { container } = render(
      <SegmentedBar
        label="Storage"
        total={100}
        segments={[
          { id: 'nodeModules', bytes: 150 },
          { id: 'buildOutput', bytes: 50 },
        ]}
      />,
    );
    const widths = [...container.querySelectorAll('div[style]')].map(
      (el) => (el as HTMLElement).style.width,
    );
    // 150/200 and 50/200 of the track, scaled to fill exactly 100%.
    expect(widths).toEqual(['75%', '25%']);
  });
});
