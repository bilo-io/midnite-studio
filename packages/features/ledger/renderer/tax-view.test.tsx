import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { mountLedger, teardownLedger } from './test-harness';
import { TaxView } from './tax-view';
import { SEED_BOOK_ID } from './memory-ledger';

afterEach(teardownLedger);

const NOTICE = 'Not tax advice';

describe('TaxView', () => {
  it('with no jurisdiction shows the notice and a select that writes the book', async () => {
    const { ledger } = mountLedger(<TaxView />);
    expect(await screen.findByText('Choose a tax jurisdiction')).toBeTruthy();
    expect(screen.getByRole('note', { name: NOTICE }).textContent).toContain('not tax advice');
    fireEvent.change(screen.getByLabelText('Tax jurisdiction'), { target: { value: 'uk-ew-ni' } });
    const table = await screen.findByRole('table', { name: 'Tax estimate' });
    expect(table).toBeTruthy();
    const got = await ledger.getBook({ bookId: SEED_BOOK_ID });
    expect(got.ok && got.value.book.jurisdiction).toBe('uk-ew-ni');
  });

  it('renders an estimate with formatted amounts, the payment-free small case, and the full notice above the table', async () => {
    const { ledger } = mountLedger(<TaxView />);
    await ledger.updateBook({ bookId: SEED_BOOK_ID, patch: { jurisdiction: 'uk-ew-ni' } });
    const select = await screen.findByLabelText('Tax year');
    fireEvent.change(select, { target: { value: '2026' } });
    const table = await screen.findByRole('table', { name: 'Tax estimate' });
    // Seeded profit 1,155.00 is inside the personal allowance: nothing is due.
    expect(within(table).getByText(/Estimated tax/).nextElementSibling?.textContent).toContain('0.00');
    const inputs = screen.getByRole('table', { name: 'Tax estimate inputs' });
    expect(within(inputs).getByText('Profit for the year').nextElementSibling?.textContent).toContain('1,155.00');
    const note = screen.getByRole('note', { name: NOTICE });
    expect(note.textContent).toMatch(/Based on the United Kingdom .* rules for 2026-27, checked 2026-11-12/);
    expect(screen.getByRole('region', { name: 'Notes' })).toBeTruthy();
  });

  it('shows the tax lines and payment dates for a larger profit', async () => {
    const { ledger } = mountLedger(<TaxView />);
    await ledger.updateBook({ bookId: SEED_BOOK_ID, patch: { jurisdiction: 'uk-ew-ni' } });
    const book = await ledger.getBook({ bookId: SEED_BOOK_ID });
    if (!book.ok) throw new Error('no book');
    const id = (name: string): string => book.value.book.accounts.find((a) => a.name === name)!.id;
    await ledger.post({
      bookId: SEED_BOOK_ID,
      entry: { date: '2026-07-01', description: 'Big job', lines: [{ accountId: id('Bank'), side: 'debit', minor: 5_000_000 }, { accountId: id('Sales'), side: 'credit', minor: 5_000_000 }], source: { app: 'money', kind: 'manual' } },
    });
    fireEvent.change(await screen.findByLabelText('Tax year'), { target: { value: '2026' } });
    const table = await screen.findByRole('table', { name: 'Tax estimate' });
    await waitFor(() => expect(within(table).getByText('Income tax, basic rate')).toBeTruthy());
    expect(within(table).getByText('Class 4 NIC, main rate')).toBeTruthy();
    const payments = screen.getByRole('region', { name: 'Payment dates' });
    expect(payments.textContent).toContain('2028-01-31');
    expect(payments.textContent).toContain('2028-07-31');
  });

  it('says a personal book has no estimate, still carrying the notice', async () => {
    const { ledger } = mountLedger(<TaxView />, { seed: false });
    const made = await ledger.createBook({ name: 'Me', entity: 'personal', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: 'personal' });
    expect(made.ok).toBe(true);
    expect(await screen.findByText(/not available for a personal book/)).toBeTruthy();
    expect(screen.getByRole('note', { name: NOTICE })).toBeTruthy();
  });

  it('carries the notice while there is no book at all', async () => {
    mountLedger(<TaxView />, { seed: false });
    expect(await screen.findByText(/Create a book/)).toBeTruthy();
    expect(screen.getByRole('note', { name: NOTICE })).toBeTruthy();
  });

  it('shows the error from the op under the notice', async () => {
    const { ledger } = mountLedger(<TaxView />);
    await ledger.updateBook({ bookId: SEED_BOOK_ID, patch: { jurisdiction: 'uk-ew-ni' } });
    ledger.taxEstimate = async () => ({ ok: false, kind: 'invalid', message: 'No such year.' });
    expect(await screen.findByText(/No such year/)).toBeTruthy();
    expect(screen.getByRole('note', { name: NOTICE })).toBeTruthy();
  });
});
