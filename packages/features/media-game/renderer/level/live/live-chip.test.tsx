// vitest/jsdom: the Live chip's text (Phase 140 Theme E).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LiveChip } from './live-chip';

afterEach(cleanup);

describe('LiveChip', () => {
  it('counts entities', () => {
    render(<LiveChip count={23} />);
    expect(screen.getByTestId('level-live-chip').textContent).toBe('Live · 23 entities');
  });
  it('is singular for one, marks a truncated list and waits before the first snapshot', () => {
    const { rerender } = render(<LiveChip count={1} />);
    expect(screen.getByTestId('level-live-chip').textContent).toBe('Live · 1 entity');
    rerender(<LiveChip count={500} truncated />);
    expect(screen.getByTestId('level-live-chip').textContent).toBe('Live · 500+ entities');
    rerender(<LiveChip count={null} />);
    expect(screen.getByTestId('level-live-chip').textContent).toBe('Live · waiting');
  });
});
