import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DiffChartCell } from './diff-chart-cell';

describe('DiffChartCell', () => {
  afterEach(cleanup);

  it('renders nothing when stat is undefined (loading / off)', () => {
    const { container } = render(<DiffChartCell stat={undefined} maxLines={100} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders em dash when stat is null (merge commit)', () => {
    render(<DiffChartCell stat={null} maxLines={100} />);
    const dash = screen.getByTitle('Merge commit — no diff shown');
    expect(dash).toBeDefined();
    expect(dash.textContent).toBe('—');
  });

  it('renders additions and deletions with diverging positioning', () => {
    render(
      <DiffChartCell
        stat={{ added: 50, deleted: 25, files: 3 }}
        maxLines={100}
      />,
    );

    const container = screen.getByTestId('diff-chart-cell-container');
    expect(container.getAttribute('title')).toBe('3 files changed (+50, −25)');

    const addBar = screen.getByTestId('diff-chart-add');
    const delBar = screen.getByTestId('diff-chart-del');

    // 50 / 100 * 46 = 23 width; x = 50 - 23 = 27
    expect(Number(addBar.getAttribute('width'))).toBeCloseTo(23, 1);
    expect(Number(addBar.getAttribute('x'))).toBeCloseTo(27, 1);

    // 25 / 100 * 46 = 11.5 width; x = 50
    expect(Number(delBar.getAttribute('width'))).toBeCloseTo(11.5, 1);
    expect(Number(delBar.getAttribute('x'))).toBe(50);
  });

  it('handles addition-only commits', () => {
    render(
      <DiffChartCell
        stat={{ added: 40, deleted: 0, files: 1 }}
        maxLines={80}
      />,
    );

    const container = screen.getByTestId('diff-chart-cell-container');
    expect(container.getAttribute('title')).toBe('1 file changed (+40, −0)');
    expect(screen.getByTestId('diff-chart-add')).toBeDefined();
    expect(screen.queryByTestId('diff-chart-del')).toBeNull();
  });

  it('handles deletion-only commits', () => {
    render(
      <DiffChartCell
        stat={{ added: 0, deleted: 10, files: 1 }}
        maxLines={50}
      />,
    );

    expect(screen.queryByTestId('diff-chart-add')).toBeNull();
    expect(screen.getByTestId('diff-chart-del')).toBeDefined();
  });

  it('handles zero additions and deletions', () => {
    render(
      <DiffChartCell
        stat={{ added: 0, deleted: 0, files: 0 }}
        maxLines={50}
      />,
    );

    expect(screen.queryByTestId('diff-chart-add')).toBeNull();
    expect(screen.queryByTestId('diff-chart-del')).toBeNull();
  });

  it('guarantees minimum bar visibility for tiny changes relative to huge max', () => {
    render(
      <DiffChartCell
        stat={{ added: 1, deleted: 1, files: 1 }}
        maxLines={10000}
      />,
    );

    const addBar = screen.getByTestId('diff-chart-add');
    const delBar = screen.getByTestId('diff-chart-del');

    expect(Number(addBar.getAttribute('width'))).toBe(1.5);
    expect(Number(delBar.getAttribute('width'))).toBe(1.5);
  });
});
