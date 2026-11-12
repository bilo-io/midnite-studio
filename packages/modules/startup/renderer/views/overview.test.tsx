// vitest/jsdom: the overview's cards over a mock bridge, and the setup prompt for a workspace with no company.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartupPane } from '../startup-pane';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 250_000, asOf: '2026-11-01' } };
const milestone = (n: number, due: string, status = 'planned') => ({ id: u(n), title: `M${n}`, description: '', status, due, dependsOn: [], tags: [] });
const overdue = { id: u(40), number: 'INV-0001', customerId: u(30), issueDate: '2020-01-01', dueDate: '2020-01-31', lines: [{ description: 'x', quantityMilli: 1000, unitMinor: 10_000, taxRateBp: 0 }], notes: '', status: 'issued', entries: {} };
const ws = (over: object) => ({ version: 1, company, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null, ...over });

function install(workspace: object, extra: Record<string, unknown> = {}) {
  window.midniteStudio = {
    startup: {
      get: vi.fn(async () => ({ ok: true, value: { workspace: workspace, revision: 0, readOnly: false } })),
      projection: vi.fn(async () => ({ ok: true, value: { months: [], burnMinor: -100_000, runwayMonths: 2, zeroCashMonth: '2027-01', defaultAlive: false } })),
      ledgerSummary: vi.fn(async () => ({ ok: true, value: { bookName: 'Acme Ltd', cashMinor: 900_000, asOf: '2026-11-12', actualBurnMinor: 80_000 } })),
      onChanged: () => () => undefined,
      ...extra,
    },
  } as unknown as typeof window.midniteStudio;
}
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Overview', () => {
  it('prompts for a company when there is none', async () => {
    install(ws({ company: null }));
    render(<StartupPane view="startup.overview" onView={() => undefined} />);
    expect(await screen.findByRole('form', { name: 'Set up your company' })).toBeTruthy();
  });

  it('renders the cards from the workspace: next three milestones by due date, overdue total, runway', async () => {
    install(ws({ milestones: [milestone(1, '2027-03-01'), milestone(2, '2027-01-01'), milestone(3, '2027-02-01'), milestone(4, '2027-04-01'), milestone(5, '2026-12-01', 'done')], invoices: [overdue], customers: [{ id: u(30), name: 'C', address: '' }] }));
    render(<StartupPane view="startup.overview" onView={() => undefined} />);
    const next = await screen.findByRole('button', { name: 'Next milestones' });
    expect(next.textContent).toContain('M2');
    expect(next.textContent).toContain('M3');
    expect(next.textContent).toContain('M1');
    expect(next.textContent).not.toContain('M4');
    expect(next.textContent).not.toContain('M5');
    expect(screen.getByRole('button', { name: 'Overdue invoices' }).textContent).toContain('£100.00');
    expect((await screen.findByRole('button', { name: 'Runway' })).textContent).toContain('2 months');
    expect(screen.getByRole('button', { name: 'Cash today' }).textContent).toContain('£2,500.00');
  });

  it('takes cash from the linked book and each card opens its view', async () => {
    install(ws({ ledger: { bookId: 'b', accounts: { receivable: 'a', sales: 'b', taxPayable: 'c', bank: 'd' } } }));
    const onView = vi.fn();
    render(<StartupPane view="startup.overview" onView={onView} />);
    const cash = await screen.findByRole('button', { name: 'Cash today' });
    await vi.waitFor(() => expect(cash.textContent).toContain('£9,000.00'));
    expect(cash.textContent).toContain('From Acme Ltd');
    fireEvent.click(screen.getByRole('button', { name: 'Overdue invoices' }));
    expect(onView).toHaveBeenCalledWith('startup.invoices');
  });
});
