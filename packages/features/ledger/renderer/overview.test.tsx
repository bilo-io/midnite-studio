import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { mountLedger, teardownLedger, confirm } from './test-harness';
import { Overview } from './overview';
import { useLedgerUiStore } from './ledger-ui-store';

afterEach(teardownLedger);

describe('Overview', () => {
  it('shows the empty state and creates a book, which the picker then shows', async () => {
    mountLedger(<Overview onOpenTab={() => {}} />, { seed: false });
    expect(await screen.findByText('No books yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Side hustle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create a book' }));
    const picker = (await screen.findByLabelText('Book')) as HTMLSelectElement;
    expect(within(picker).getByRole('option', { name: 'Side hustle' })).toBeTruthy();
  });

  it('shows the four headline numbers for the seeded book', async () => {
    mountLedger(<Overview onOpenTab={() => {}} />);
    expect(await screen.findByLabelText(/^Cash: /)).toBeTruthy();
    // 6,200.00 in, 45.00 out of the bank.
    expect(screen.getByLabelText(/^Cash: .*6,155\.00/)).toBeTruthy();
    expect(screen.getByLabelText(/^Owed to you: /)).toBeTruthy();
    expect(screen.getByLabelText(/^You owe: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Profit this fiscal year: /)).toBeTruthy();
  });

  it('opens the journal from a headline', async () => {
    const onOpenTab = vi.fn();
    mountLedger(<Overview onOpenTab={onOpenTab} />);
    fireEvent.click(await screen.findByLabelText(/^Owed to you: /));
    expect(onOpenTab).toHaveBeenCalledWith('journal');
    expect(useLedgerUiStore.getState().journalFilter.accountId).not.toBeNull();
  });

  it('renders the amber read-only banner for a read-only book', async () => {
    mountLedger(<Overview onOpenTab={() => {}} />, { readOnlyBy: 'studio' });
    expect((await screen.findByRole('status', { name: '' })).textContent).toBeDefined();
    expect(await screen.findByText(/Read-only — this book is open for writing in studio\./)).toBeTruthy();
  });

  it('renders the red corrupt banner with the line numbers and a copy-path button', async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    mountLedger(<Overview onOpenTab={() => {}} />, { corruptLines: [3] });
    expect(await screen.findByText(/Journal line 3 could not be read/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }));
    expect(writeText).toHaveBeenCalledWith('/books/acme');
  });

  it('asks before locking the books later, naming how many entries fall in the range', async () => {
    mountLedger(<Overview onOpenTab={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Book settings' }));
    fireEvent.change(await screen.findByLabelText('Lock books through'), { target: { value: '2026-04-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ title: 'Lock books through 2026-04-30?', confirmLabel: 'Lock', body: expect.stringContaining('2 entries fall in the newly locked range') });
  });
});
