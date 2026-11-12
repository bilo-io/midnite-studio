// vitest/jsdom: Settings ▸ Company ▸ Books over a mock bridge: the list, the currency rule and main's refusal.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STARTUP_SETTINGS } from '../startup-settings';

const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } };
const books = [
  { id: 'gbp', name: 'Acme Ltd', entity: 'company', currency: 'GBP', readOnly: false, revision: 0 },
  { id: 'usd', name: 'US Books', entity: 'company', currency: 'USD', readOnly: false, revision: 0 },
];
function install(linkBook: ReturnType<typeof vi.fn> = vi.fn(async () => ({ ok: true, value: {} }))) {
  const workspace = { version: 1, company, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null };
  window.midniteStudio = {
    startup: { get: vi.fn(async () => ({ ok: true, value: { workspace, revision: 0, readOnly: false } })), linkBook, updateCompany: vi.fn(), onChanged: () => () => undefined },
    ledger: { listBooks: vi.fn(async () => ({ ok: true, value: { books } })) },
  } as unknown as typeof window.midniteStudio;
  return linkBook;
}
const Page = STARTUP_SETTINGS[0]!.Page;

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('BookLink', () => {
  it('lists books, disables one in another currency, and links the chosen one', async () => {
    const linkBook = install();
    render(<Page />);
    const select = (await screen.findByLabelText('Book')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    const usd = [...select.options].find((o) => o.value === 'usd')!;
    expect(usd.disabled).toBe(true);
    expect(usd.textContent).toContain('Different currency');
    fireEvent.change(select, { target: { value: 'gbp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(linkBook).toHaveBeenCalledWith({ bookId: 'gbp' }));
  });

  it("shows main's refusal, such as a book with no receivable account", async () => {
    install(vi.fn(async () => ({ ok: false, kind: 'ledger', message: 'Acme Ltd has no receivable account.' })));
    render(<Page />);
    const select = (await screen.findByLabelText('Book')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    fireEvent.change(select, { target: { value: 'gbp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect((await screen.findByText('Acme Ltd has no receivable account.')).getAttribute('role')).toBe('alert');
  });
});
