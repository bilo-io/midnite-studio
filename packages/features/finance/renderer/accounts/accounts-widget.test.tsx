import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider, type FrameChrome } from '@midnite/studio-frame';
import type { AccountSnapshot, BrokerAccount } from '@midnite/studio-shared';

import { FinanceHostProvider, type FinanceHost } from '../host';
import { AccountsWidget } from './accounts-widget';

// jsdom is enough: this is DOM text, roles and a mock bridge — no layout, no real CSS.

const SECRET = 'super-secret-private-key';

const connectors = [
  {
    id: 'alpaca',
    label: 'Alpaca',
    assetClass: 'stocks',
    inputs: [
      { name: 'apiKeyId', label: 'API key ID' },
      { name: 'apiSecret', label: 'API secret' },
    ],
    supportsEnvironment: true,
    readOnlyHint: 'Use a paper-trading key where you can.',
  },
];

const account = (id: string, label: string): BrokerAccount => ({ id, connector: 'alpaca', label, environment: 'paper', createdAt: 1 });

const snapshot = (a: BrokerAccount, patch: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  account: a,
  balances: [{ currency: 'USD', total: 1000, available: 1000, usd: 1000 }],
  positions: [{ symbol: 'AAPL', quantity: 10, marketValueUsd: 1800, costBasisUsd: 1500, unrealizedPnlUsd: 300 }],
  history: [
    { t: 1, equityUsd: 2500 },
    { t: 2, equityUsd: 2800 },
  ],
  allocation: [
    { label: 'AAPL', valueUsd: 1800, weight: 0.64 },
    { label: 'USD', valueUsd: 1000, weight: 0.36 },
  ],
  performance: { startUsd: 2500, endUsd: 2800, changeUsd: 300, changePct: 0.12 },
  totalUsd: 2800,
  fetchedAt: 1,
  error: null,
  ...patch,
});

const confirm = vi.fn();
const chrome: FrameChrome = {
  IconButton: ({ label, onClick, disabled }) => (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} />
  ),
  ConfirmDialog: () => null,
  useDialogs: () => ({ confirm, notify: vi.fn(), setBlastRadius: vi.fn(), close: vi.fn() }),
  PageDetachMark: () => null,
};
const host = {
  Modal: () => null,
  Popover: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
} as unknown as FinanceHost;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={chrome}>
        <FinanceHostProvider host={host}>
          <AccountsWidget />
        </FinanceHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

function stubBridge(accounts: BrokerAccount[], snaps: AccountSnapshot[]) {
  const state = { accounts };
  const api = {
    list: vi.fn(async () => ({ ok: true, value: { connectors, accounts: state.accounts } })),
    test: vi.fn(async () => ({ ok: true, value: { summary: 'Connected — 1 balance found.' } })),
    add: vi.fn(async () => {
      state.accounts = [account('alpaca-1', 'Paper')];
      return { ok: true, value: { account: state.accounts[0] } };
    }),
    remove: vi.fn(async () => ({ ok: true, value: { removed: true } })),
    snapshots: vi.fn(async () => ({
      ok: true,
      value: { snapshots: snaps, byAccount: snaps.map((s) => ({ label: s.account.label, valueUsd: s.totalUsd, weight: 1 / snaps.length })) },
    })),
  };
  Object.assign(window, { midniteStudio: { financeAccounts: api } });
  return api;
}

beforeEach(() => confirm.mockReset());
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'midniteStudio');
});

describe('AccountsWidget', () => {
  it('opens on the add form, with the read-only hint and write-only credential inputs', async () => {
    stubBridge([], []);
    mount();
    expect(await screen.findByText('Use a paper-trading key where you can.')).toBeTruthy();
    for (const label of ['API key ID', 'API secret']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe('password');
    }
    expect((screen.getByRole('button', { name: 'Add account' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('tests a connection, then adds the account and drops the typed credential', async () => {
    const api = stubBridge([], [snapshot(account('alpaca-1', 'Paper'))]);
    const { container } = mount();
    fireEvent.change(await screen.findByLabelText('API key ID'), { target: { value: 'PKTEST' } });
    fireEvent.change(screen.getByLabelText('API secret'), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connected — 1 balance found.')).toBeTruthy();
    expect(api.test).toHaveBeenCalledWith({ connector: 'alpaca', environment: 'paper', fields: { apiKeyId: 'PKTEST', apiSecret: SECRET } });

    fireEvent.change(screen.getByLabelText('Account label'), { target: { value: 'Paper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(api.add).toHaveBeenCalledOnce());
    expect(api.add).toHaveBeenCalledWith({ connector: 'alpaca', environment: 'paper', label: 'Paper', fields: { apiKeyId: 'PKTEST', apiSecret: SECRET } });
    await screen.findByRole('tab', { name: 'Paper' });
    // The secret is not anywhere in the document once saved.
    expect(container.innerHTML).not.toContain(SECRET);
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('lists each account with its total, and shows a failing account\'s error without hiding the rest', async () => {
    const a = account('a', 'Alpha');
    const b = account('b', 'Beta');
    stubBridge([a, b], [snapshot(a), snapshot(b, { totalUsd: 0, balances: [], positions: [], error: 'alpaca rejected the credentials (401)' })]);
    mount();
    const list = await screen.findByRole('list', { name: 'Account balances' });
    await waitFor(() => expect(within(list).getByText('Alpha').closest('li')?.textContent).toContain('$2,800.00'));
    const beta = within(list).getByText('Beta').closest('li') as HTMLElement;
    expect(within(beta).getByRole('alert').textContent).toContain('rejected the credentials');
  });

  it('shows positions, allocation and performance for a selected account', async () => {
    const a = account('a', 'Alpha');
    stubBridge([a], [snapshot(a)]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Alpha' }));
    const table = await screen.findByRole('table', { name: 'Positions' });
    expect(within(table).getByText('AAPL')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Allocation legend' }).textContent).toContain('64.0%');
    expect(screen.getByTestId('accounts-performance').textContent).toContain('+$300.00');
  });

  it('removal is confirmed with blast-radius copy, then removes', async () => {
    const a = account('a', 'Alpha');
    const api = stubBridge([a], [snapshot(a)]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Alpha' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alpha' }));
    expect(api.remove).not.toHaveBeenCalled();
    const request = confirm.mock.calls[0]?.[0] as { danger: boolean; blastRadiusKind: string; body: string; onConfirm: () => void };
    expect(request).toMatchObject({ danger: true, blastRadiusKind: 'secrets' });
    expect(request.body).toMatch(/deleted from the vault/);
    request.onConfirm();
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ id: 'a' }));
  });

  it('offers no way to trade, withdraw or transfer', async () => {
    const a = account('a', 'Alpha');
    stubBridge([a], [snapshot(a)]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Alpha' }));
    await screen.findByRole('table', { name: 'Positions' });
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(names.filter((n) => /buy|sell|trade|order|withdraw|transfer|deposit/i.test(n))).toEqual([]);
  });
});
