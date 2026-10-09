import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffPaneClose, DiffPaneFrame } from './diff-pane-frame';

afterEach(cleanup);

describe('DiffPaneFrame', () => {
  it('lets the content header own the one Close button and renders no bar of its own', () => {
    const onClose = vi.fn();
    render(
      <DiffPaneFrame onClose={onClose}>
        <header data-testid="files-header">
          <span>3 files</span>
          <button type="button">Collapse all files</button>
          <DiffPaneClose />
        </header>
      </DiffPaneFrame>,
    );
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(screen.queryByTestId('diff-viewer-header')).toBeNull();
    expect(screen.getByTestId('files-header').lastElementChild).toBe(closes[0]);
    fireEvent.click(closes[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to a minimal header when the content has none (empty / loading)', () => {
    const onClose = vi.fn();
    render(
      <DiffPaneFrame onClose={onClose}>
        <p>Loading…</p>
      </DiffPaneFrame>,
    );
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(screen.getByTestId('diff-viewer-header').lastElementChild).toBe(closes[0]);
  });

  it('renders no Close at all without onClose', () => {
    render(
      <DiffPaneFrame>
        <DiffPaneClose />
      </DiffPaneFrame>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});
