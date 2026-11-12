import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { mountLedger, teardownLedger } from './test-harness';
import { ImportView } from './import-view';

afterEach(teardownLedger);

const choose = async () => fireEvent.click(await screen.findByRole('button', { name: 'Choose a statement…' }));
const rowSelect = (n: number) => screen.getByLabelText(`Account for row ${n}`) as HTMLSelectElement;
const salesValue = (n: number): string => (within(rowSelect(n)).getByRole('option', { name: '4000 Sales' }) as HTMLOptionElement).value;

describe('ImportView', () => {
  it('maps the picked statement and previews its rows with the rule suggestion', async () => {
    mountLedger(<ImportView />);
    await choose();
    expect(await screen.findByText('ADOBE *CREATIVE CLOUD')).toBeTruthy();
    // The seeded "adobe" rule files row 1 under Software; the rest need an account.
    expect(within(rowSelect(1)).getByRole('option', { name: '6000 Software & subscriptions', selected: true })).toBeTruthy();
    expect(rowSelect(2).value).toBe('');
    expect(screen.getByText(/1 ready · 3 need an account/)).toBeTruthy();
  });

  it('keeps Post disabled while a row needs an account, then posts and summarises', async () => {
    const { ledger } = mountLedger(<ImportView />);
    await choose();
    await screen.findByText('ADOBE *CREATIVE CLOUD');
    const post = screen.getByRole('button', { name: /^Post 4 entries/ }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    for (const n of [2, 3, 4]) fireEvent.change(rowSelect(n), { target: { value: salesValue(n) } });
    await waitFor(() => expect((screen.getByRole('button', { name: /^Post 4 entries/ }) as HTMLButtonElement).disabled).toBe(false));
    const before = ledger.entries().length;
    fireEvent.click(screen.getByRole('button', { name: /^Post 4 entries/ }));
    expect(await screen.findByText(/Posted 4 entries/)).toBeTruthy();
    expect(ledger.entries().length).toBe(before + 4);
  });

  it('shows the read-only banner and no way to pick for a book another app holds', async () => {
    mountLedger(<ImportView />, { readOnlyBy: 'studio' });
    expect(await screen.findByText(/Read-only — this book is open for writing in studio/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Choose a statement…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Remember only after a manual pick', async () => {
    mountLedger(<ImportView />);
    await choose();
    await screen.findByText('Mystery transfer');
    expect(screen.queryByLabelText('Remember for next time, row 4')).toBeNull();
    fireEvent.change(rowSelect(4), { target: { value: salesValue(4) } });
    expect(await screen.findByLabelText('Remember for next time, row 4')).toBeTruthy();
  });
});
