// vitest/jsdom: the vendors list, the Action needed strip and the contract sheet over a mock bridge.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Contract, Vendor } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } };
const vendor: Vendor = { id: u(2), name: 'Cloud Co', category: 'software', notes: '' };
const ending: Contract = { id: u(3), title: 'Office lease', counterparty: { kind: 'vendor', id: u(2) }, start: '2020-01-01', end: '2999-01-01', autoRenews: false, noticeDays: 0 };
const soon: Contract = { ...ending, id: u(4), title: 'Hosting', end: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) };
const snapshot = (vendors: Vendor[], contracts: Contract[]) => ({
  ok: true,
  value: { workspace: { version: 1, company, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors, contracts, invoiceCounter: 0, ledger: null }, revision: 0, readOnly: false },
});
function install(vendors: Vendor[], contracts: Contract[], extra: Record<string, unknown> = {}) {
  window.midniteStudio = { startup: { get: vi.fn(async () => snapshot(vendors, contracts)), onChanged: () => () => undefined, ...extra } } as unknown as typeof window.midniteStudio;
}
const renderVendors = () => render(<StartupPane view="startup.vendors" onView={() => undefined} />);

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('VendorsView', () => {
  it('shows the empty states for vendors and contracts', async () => {
    install([], []);
    renderVendors();
    expect(await screen.findByText('No vendors yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'contracts' }));
    expect(screen.getByText('No contracts yet')).toBeTruthy();
  });

  it('flags a contract ending within 30 days in the Action needed strip, and not a far-off one', async () => {
    install([vendor], [ending, soon]);
    renderVendors();
    const strip = await screen.findByRole('region', { name: 'Action needed' });
    expect(strip.textContent).toContain('Hosting');
    expect(strip.textContent).not.toContain('Office lease');
  });

  it('saves a priced contract in minor units against the chosen vendor', async () => {
    const upsertContract = vi.fn(async () => snapshot([vendor], []));
    install([vendor], [], { upsertContract });
    renderVendors();
    fireEvent.click(await screen.findByRole('tab', { name: 'contracts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add contract' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hosting' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Price (GBP)'), { target: { value: '49.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(upsertContract).toHaveBeenCalledTimes(1));
    const [{ contract }] = upsertContract.mock.calls[0] as unknown as [{ contract: Contract }];
    expect(contract).toMatchObject({ title: 'Hosting', counterparty: { kind: 'vendor', id: u(2) }, value: { minor: 4999, cadence: 'monthly' } });
  });
});
