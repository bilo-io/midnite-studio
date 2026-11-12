import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LedgerWorkspace } from './ledger-workspace';

afterEach(cleanup);

describe('LedgerWorkspace', () => {
  it('shows the empty state and a tab strip', () => {
    render(<LedgerWorkspace />);
    expect(screen.getByText('No books yet')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
  });

  it('switches tabs, and hides the strip when a host drives it', () => {
    const { rerender } = render(<LedgerWorkspace />);
    fireEvent.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(screen.getByRole('tab', { name: 'Journal' }).getAttribute('aria-selected')).toBe('true');
    rerender(<LedgerWorkspace tab="tax" showTabs={false} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByLabelText('Tax')).toBeTruthy();
  });
});
