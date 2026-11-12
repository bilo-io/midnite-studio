import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { mountLedger, teardownLedger } from './test-harness';
import { Accounts } from './accounts';

afterEach(teardownLedger);

describe('Accounts', () => {
  it('groups the chart by type with balances on the normal side', async () => {
    mountLedger(<Accounts />);
    const assets = await screen.findByRole('region', { name: 'Assets' });
    expect(within(assets).getByText('Bank')).toBeTruthy();
    expect(within(assets).getByText(/6,155\.00/)).toBeTruthy();
    expect(within(await screen.findByRole('region', { name: 'Income' })).getByText(/1,200\.00/)).toBeTruthy();
  });

  it('refuses to archive an account with a balance, naming it', async () => {
    mountLedger(<Accounts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bank' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bank has a balance of .*6,155\.00 and cannot be archived/);
  });

  it('adds an account, and hides archived accounts behind a toggle', async () => {
    mountLedger(<Accounts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add account' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '6100' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Travel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Travel' })).toBeTruthy();
    // Archive it (zero balance) and it disappears until the toggle is on.
    fireEvent.click(screen.getByRole('button', { name: 'Travel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull());
    fireEvent.click(screen.getByLabelText('Show archived'));
    expect(await screen.findByRole('button', { name: 'Travel' })).toBeTruthy();
  });

  it('disables editing on a read-only book', async () => {
    mountLedger(<Accounts />, { readOnlyBy: 'studio' });
    expect(((await screen.findByRole('button', { name: 'Add account' })) as HTMLButtonElement).disabled).toBe(true);
  });
});
