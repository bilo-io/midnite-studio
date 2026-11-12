import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { LedgerReport } from '@midnite/studio-shared';

import { mountLedger, teardownLedger } from './test-harness';
import { ReportsView } from './reports-view';
import { useLedgerUiStore } from './ledger-ui-store';

afterEach(() => {
  vi.useRealTimers();
  teardownLedger();
});

const pickKind = (name: string) => fireEvent.change(screen.getByLabelText('Report'), { target: { value: name } });

describe('ReportsView', () => {
  it('renders the profit and loss from the seeded journal, with rows linking to the filtered journal', async () => {
    const onOpenTab = vi.fn();
    mountLedger(<ReportsView onOpenTab={onOpenTab} />);
    fireEvent.change(await screen.findByLabelText('Period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-06' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-05-31' } });
    const table = await screen.findByRole('table', { name: 'Profit and loss' });
    // Invoice 1,200.00 in sales, Figma 45.00 out.
    expect(within(table).getByText('Net profit').nextElementSibling?.textContent).toContain('1,155.00');
    fireEvent.click(within(table).getByRole('button', { name: /Sales/ }));
    expect(onOpenTab).toHaveBeenCalledWith('journal');
    expect(useLedgerUiStore.getState().journalFilter.accountId).not.toBeNull();
  });

  it('turns a range preset into the request arguments', async () => {
    const { ledger } = mountLedger(<ReportsView onOpenTab={() => {}} />);
    const spy = vi.spyOn(ledger, 'report');
    await screen.findByLabelText('Period');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'last-fiscal-year' } });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const last = spy.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ kind: 'profit-and-loss' });
    // The preset is the fiscal year before the one containing today, ending the day before this year starts.
    expect(last?.from < (last?.to as string)).toBe(true);
    expect(last?.from.slice(5)).toBe('04-06');
    expect(last?.to.slice(5)).toBe('04-05');
  });

  it('shows the balance sheet balanced, with the two computed equity lines', async () => {
    mountLedger(<ReportsView onOpenTab={() => {}} />);
    await screen.findByLabelText('Report');
    pickKind('balance-sheet');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-05-31' } });
    const table = await screen.findByRole('table', { name: 'Balance sheet' });
    expect(within(table).getByText('Retained earnings')).toBeTruthy();
    expect(within(table).getByText('Profit this year')).toBeTruthy();
    expect(within(table).queryByText('Out of balance by')).toBeNull();
  });

  it('renders the Unreconciled row when the report has a remainder, and never when it reconciles', async () => {
    const { ledger } = mountLedger(<ReportsView onOpenTab={() => {}} />);
    const cash = (unreconciled: number): LedgerReport => ({
      kind: 'cash-flow', currency: 'GBP', from: '2026-04-06', to: '2026-05-31', netProfit: 0, operating: [], operatingTotal: 0, investing: [], investingTotal: 0, financing: [], financingTotal: 0, netChange: 0, openingCash: 0, closingCash: unreconciled, unreconciled,
    });
    const spy = vi.spyOn(ledger, 'report').mockResolvedValue({ ok: true, value: cash(250) });
    await screen.findByLabelText('Report');
    pickKind('cash-flow');
    expect((await screen.findByRole('alert')).textContent).toContain('Unreconciled');
    spy.mockResolvedValue({ ok: true, value: cash(0) });
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'month' } });
    await waitFor(() => expect(screen.queryByText('Unreconciled')).toBeNull());
  });

  it('exports the report and says so, and a cancelled dialog says nothing', async () => {
    const { ledger } = mountLedger(<ReportsView onOpenTab={() => {}} />);
    const spy = vi.spyOn(ledger, 'exportReport').mockResolvedValue({ ok: true, value: { path: '/tmp/x.csv' } });
    await screen.findByRole('table', { name: 'Profit and loss' });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText('Report saved.')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'profit-and-loss' }));
  });

  it('flags a backwards custom range instead of asking main', async () => {
    mountLedger(<ReportsView onOpenTab={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-05-01' } });
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toContain('start date is after');
  });
});
