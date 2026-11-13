import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LedgerWorkspace } from './ledger-workspace';
import { mountLedger, teardownLedger } from './test-harness';

afterEach(teardownLedger);

describe('LedgerWorkspace', () => {
  it('shows the empty state and a tab strip', async () => {
    mountLedger(<LedgerWorkspace />, { seed: false });
    expect(await screen.findByText('No books yet')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
  });

  it('switches tabs, and hides the strip when a host drives it', async () => {
    const { rerender } = mountLedger(<LedgerWorkspace />, { seed: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(screen.getByRole('tab', { name: 'Journal' }).getAttribute('aria-selected')).toBe('true');
    rerender(<LedgerWorkspace tab="tax" showTabs={false} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByLabelText('Tax')).toBeTruthy();
  });
});
