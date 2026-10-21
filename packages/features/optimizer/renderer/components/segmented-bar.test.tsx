import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { categoryColor, CATEGORY_LABELS, ecosystemColor, ECOSYSTEM_LABELS } from '../category-palette';
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
        color={categoryColor}
        name={(id) => CATEGORY_LABELS[id]}
        segments={[
          { id: 'dependencies', bytes: 40 },
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
      <SegmentedBar
        label="Storage"
        total={0}
        color={categoryColor}
        name={(id) => CATEGORY_LABELS[id]}
        segments={[{ id: 'dependencies', bytes: 10 }]}
      />,
    );
    expect(container.querySelectorAll('div[style]')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('scales segments down proportionally when they sum above total', () => {
    const { container } = render(
      <SegmentedBar
        label="Storage"
        total={100}
        color={categoryColor}
        name={(id) => CATEGORY_LABELS[id]}
        segments={[
          { id: 'dependencies', bytes: 150 },
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

  it('admits a second id type — the ecosystem axis, not just category', () => {
    const { container, getByRole } = render(
      <SegmentedBar
        label="Reclaimable storage by ecosystem"
        total={100}
        color={ecosystemColor}
        name={(id) => ECOSYSTEM_LABELS[id]}
        segments={[
          { id: 'rust', bytes: 30 },
          { id: 'python', bytes: 70 },
        ]}
      />,
    );
    const widths = [...container.querySelectorAll('div[style]')].map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths).toEqual(['30%', '70%']);
    expect(getByRole('img', { name: 'Reclaimable storage by ecosystem' })).toBeTruthy();
  });
});
