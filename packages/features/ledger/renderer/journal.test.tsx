import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { mountLedger, teardownLedger } from './test-harness';
import { Journal } from './journal';

afterEach(teardownLedger);

const noop = (): void => {};

async function openNewEntry(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'New entry' }));
  await screen.findByRole('dialog', { name: 'New entry' });
}

function fillLine(n: number, account: string, debit: string, credit: string): void {
  fireEvent.change(screen.getByLabelText(`Account ${n}`), { target: { value: account } });
  fireEvent.change(screen.getByLabelText(`Debit ${n}`), { target: { value: debit } });
  fireEvent.change(screen.getByLabelText(`Credit ${n}`), { target: { value: credit } });
}

const acct = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('Journal', () => {
  it('lists entries newest first with a source badge', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Figma subscription');
    expect(within(items[0] as HTMLElement).getByText('Manual')).toBeTruthy();
  });

  it('keeps Post disabled at a difference of 0.01 and enables it at 0', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    await openNewEntry();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Coffee' } });
    fillLine(1, acct(6), '10.01', '');
    fillLine(2, acct(1), '', '10.00');
    expect(screen.getByText(/Difference:/).textContent).toContain('0.01');
    expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true);
    fillLine(2, acct(1), '', '10.01');
    expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks a bad amount aria-invalid with the reason', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    await openNewEntry();
    fillLine(1, acct(6), 'abc', '');
    expect(screen.getByLabelText('Debit 1').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toMatch(/not a number/);
  });

  it('posts an entry and shows it at the top', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    await openNewEntry();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Coffee beans' } });
    fillLine(1, acct(6), '12.50', '');
    fillLine(2, acct(1), '', '12.50');
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('Coffee beans'));
  });

  it('requires a reason before a reversal, then shows "Reversed on"', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    const item = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Reverse' }));
    const submit = (await screen.findByRole('button', { name: 'Reverse entry' })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'wrong amount' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getAllByText(/Reversed on/).length).toBe(1));
  });

  it('renders the locked-period copy with the lock date', async () => {
    const { ledger } = mountLedger(<Journal onOpenSettings={noop} />);
    const [book] = (await ledger.listBooks()).ok ? [(await ledger.listBooks())] : [];
    expect(book).toBeDefined();
    const id = ((await ledger.listBooks()) as { ok: true; value: { books: { id: string }[] } }).value.books[0]?.id as string;
    await ledger.updateBook({ bookId: id, patch: { lockedThrough: '2026-12-31' } });
    await openNewEntry();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Late' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-01' } });
    fillLine(1, acct(6), '1.00', '');
    fillLine(2, acct(1), '', '1.00');
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Books are locked through 2026-12-31.');
  });

  it('opens New entry with N and expands with Enter while the list has focus', async () => {
    mountLedger(<Journal onOpenSettings={noop} />);
    const list = await screen.findByRole('list', { name: 'Journal entries' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(within(list).getAllByRole('row').length).toBe(2);
    fireEvent.keyDown(list, { key: 'n' });
    expect(await screen.findByRole('dialog', { name: 'New entry' })).toBeTruthy();
  });

  it('disables New entry on a read-only book', async () => {
    mountLedger(<Journal onOpenSettings={noop} />, { readOnlyBy: 'studio' });
    expect(((await screen.findByRole('button', { name: 'New entry' })) as HTMLButtonElement).disabled).toBe(true);
  });
});
