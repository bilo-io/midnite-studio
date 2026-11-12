// vitest/jsdom: the invoices list, the draft editor and the confirm copy over a mock bridge.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Customer, Invoice } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } };
const customer: Customer = { id: u(30), name: 'Client Ltd', address: '' };
const line = { description: 'Consulting', quantityMilli: 12000, unitMinor: 10000, taxRateBp: 2000 };
const base: Invoice = { id: u(40), number: null, customerId: u(30), issueDate: null, dueDate: null, lines: [line], notes: '', status: 'draft', entries: {} };
const ledger = { bookId: 'book-1', accounts: { receivable: 'a', sales: 'b', taxPayable: 'c', bank: 'd' } };

const snapshot = (invoices: Invoice[], linked: boolean) => ({
  ok: true,
  value: { workspace: { version: 1, company, milestones: [], lines: [], scenarios: [], customers: [customer], invoices, vendors: [], contracts: [], invoiceCounter: 0, ledger: linked ? ledger : null }, revision: 0, readOnly: false },
});
function install(invoices: Invoice[], linked: boolean, extra: Record<string, unknown> = {}) {
  window.midniteStudio = {
    startup: { get: vi.fn(async () => snapshot(invoices, linked)), onChanged: () => () => undefined, ...extra },
    ledger: { listBooks: vi.fn(async () => ({ ok: true, value: { books: [{ id: 'book-1', name: 'Acme Ltd', entity: 'company', currency: 'GBP', readOnly: false, revision: 0 }] } })) },
  } as unknown as typeof window.midniteStudio;
}
const renderInvoices = () => render(<StartupPane view="startup.invoices" onView={() => undefined} />);

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('InvoicesView', () => {
  it('disables Issue without a linked book and says how to enable it', async () => {
    install([base], false);
    renderInvoices();
    fireEvent.click(await screen.findByText('Draft'));
    const issue = await screen.findByRole('button', { name: 'Issue' });
    expect((issue as HTMLButtonElement).disabled).toBe(true);
    expect(issue.getAttribute('title')).toBe('Link a book in Settings ▸ Company to issue invoices.');
  });

  it('shows live totals and a confirm that names the amount and the book', async () => {
    const issueInvoice = vi.fn(async () => snapshot([], true));
    const upsertInvoice = vi.fn(async () => snapshot([base], true));
    install([base], true, { issueInvoice, upsertInvoice });
    renderInvoices();
    fireEvent.click(await screen.findByText('Draft'));
    const totals = await screen.findByLabelText('Totals');
    expect(totals.textContent).toContain('£1,200.00');
    expect(totals.textContent).toContain('£240.00');
    expect(totals.textContent).toContain('£1,440.00');
    const issue = screen.getByRole('button', { name: 'Issue' });
    await waitFor(() => expect((issue as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(issue);
    const dialog = await screen.findByText(/Posts £1,440.00 to Acme Ltd: receivable, sales, tax/);
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(issueInvoice).toHaveBeenCalledTimes(1));
    expect(upsertInvoice).toHaveBeenCalledTimes(1);
  });

  it('shows a void invoice as VOID with no issue, pay or void actions', async () => {
    const voided: Invoice = { ...base, number: 'INV-0001', status: 'void', issueDate: '2026-10-01', dueDate: '2026-10-31', voidReason: 'Wrong customer' };
    install([voided], true);
    renderInvoices();
    const row = (await screen.findByText('INV-0001')).closest('tr')!;
    expect(within(row).getByText('VOID')).toBeTruthy();
    fireEvent.click(row);
    await screen.findByLabelText('INV-0001');
    for (const name of ['Issue', 'Mark paid', 'Void', 'Save draft']) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('derives Overdue from the due date and filters by it', async () => {
    const late: Invoice = { ...base, id: u(41), number: 'INV-0002', status: 'issued', issueDate: '2020-01-01', dueDate: '2020-01-31' };
    install([base, late], true);
    renderInvoices();
    const row = (await screen.findByText('INV-0002')).closest('tr')!;
    expect(within(row).getByText('overdue')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'overdue' } });
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.getByText('INV-0002')).toBeTruthy();
  });

  it('shows the empty state, and the customers tab lists customers', async () => {
    install([], false);
    renderInvoices();
    expect(await screen.findByText('No invoices yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'customers' }));
    expect(screen.getByText('Client Ltd')).toBeTruthy();
  });

  it('shows main\'s refusal when saving fails', async () => {
    install([base], true, { upsertInvoice: vi.fn(async () => ({ ok: false, kind: 'not-found', message: 'That customer no longer exists.' })) });
    renderInvoices();
    fireEvent.click(await screen.findByText('Draft'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That customer no longer exists.');
  });
});
