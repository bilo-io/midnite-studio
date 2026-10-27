import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DiffStatCell } from './diff-stat-cell';

describe('DiffStatCell', () => {
  afterEach(cleanup);

  it('renders a not-yet-loaded stat as a neutral placeholder, never +0 −0', () => {
    const { container } = render(<DiffStatCell stat={undefined} />);
    expect(screen.getByTestId('diff-stat-pending').textContent).toBe('…');
    expect(container.textContent).not.toContain('+0');
    expect(container.textContent).not.toContain('−0');
  });

  it('renders a loaded stat as +added −deleted, with the file count in the tooltip', () => {
    render(<DiffStatCell stat={{ added: 1, deleted: 1, files: 1 }} />);
    expect(screen.getByTitle('1 file changed').textContent).toBe('+1−1');
    expect(screen.queryByTestId('diff-stat-pending')).toBeNull();
  });

  it('still renders a genuinely empty commit as +0 −0 — loaded, and zero', () => {
    render(<DiffStatCell stat={{ added: 0, deleted: 0, files: 0 }} />);
    expect(screen.getByTitle('0 files changed').textContent).toBe('+0−0');
  });
});
