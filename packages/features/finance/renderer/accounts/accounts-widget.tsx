import { useMemo, useState } from 'react';

import { LuLandmark, LuPlus, LuRefreshCw, LuTrash2 } from 'react-icons/lu';

import { assetColor, type AccountSnapshot, type AllocationSlice } from '@midnite/studio-shared';

import { useFrameChrome } from '@midnite/studio-frame';
import { formatMoney, formatQuantity, formatSignedPct } from '../dashboard/finance-format';
import { Donut, Sparkline } from '../dashboard/finance-parts';
import { EmptyState, IconButton, Skeleton } from '../ui';
import { AddAccountForm } from './add-account-form';
import { useAccountList, useAccountSnapshots, useRefreshAccounts, useRemoveAccount } from './accounts-queries';

/**
 * Read-only brokerage and exchange accounts (Phase 113 Theme P slice 2): balances, positions,
 * allocation and performance for every connected account, and the form that connects one.
 *
 * Nothing here can trade — there is no order control, and the bridge it calls has no such method.
 * A failing account shows its own error line and keeps the last numbers it had; the others are
 * untouched.
 */
const PALETTE = ['#3B82F6', '#F59E0B', '#10B981', '#A855F7', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

type DonutSlice = { id: string; label: string; color: string; valueUsd: number; share: number; kind: 'asset' };

const donutSlices = (slices: readonly AllocationSlice[], coloured: boolean): DonutSlice[] =>
  slices.map((s, i) => ({
    id: s.label,
    label: s.label,
    color: coloured ? assetColor(s.label) : (PALETTE[i % PALETTE.length] as string),
    valueUsd: s.valueUsd,
    share: s.weight,
    kind: 'asset' as const,
  }));

const usd = (n: number | null): string => (n === null ? '—' : formatMoney(n, 'USD'));

function Allocation({ slices, label }: { slices: DonutSlice[]; label: string }) {
  const total = slices.reduce((sum, s) => sum + s.valueUsd, 0);
  if (slices.length === 0) return <p className="text-xs text-muted-foreground">Nothing priced to allocate yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Donut slices={slices} size={132} thickness={15}>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span data-testid="accounts-allocation-total" className="max-w-[90px] truncate text-sm font-semibold tabular-nums">
          {formatMoney(total, 'USD', { compact: total >= 1_000_000 })}
        </span>
      </Donut>
      <ul aria-label="Allocation legend" className="flex min-w-[9rem] flex-1 flex-col gap-0.5 text-xs">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{(s.share * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Performance({ snapshot }: { snapshot: AccountSnapshot }) {
  const { performance } = snapshot;
  if (!performance) return <p className="text-xs text-muted-foreground">Not enough history for a performance line yet.</p>;
  const direction = performance.changeUsd > 0 ? 'up' : performance.changeUsd < 0 ? 'down' : 'flat';
  return (
    <div className="flex items-center gap-3" data-testid="accounts-performance">
      <Sparkline values={snapshot.history.map((p) => p.equityUsd)} direction={direction} width={160} height={40} area label="Equity curve" />
      <span className="text-xs tabular-nums" data-tone={direction}>
        {performance.changeUsd >= 0 ? '+' : '−'}
        {formatMoney(Math.abs(performance.changeUsd), 'USD')}
        {performance.changePct === null ? '' : ` (${formatSignedPct(performance.changePct * 100)})`}
      </span>
    </div>
  );
}

function Positions({ snapshot }: { snapshot: AccountSnapshot }) {
  if (snapshot.positions.length === 0) return <p className="text-xs text-muted-foreground">No open positions.</p>;
  return (
    <table aria-label="Positions" className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1 font-medium">Asset</th>
          <th className="py-1 text-right font-medium">Quantity</th>
          <th className="py-1 text-right font-medium">Value</th>
          <th className="py-1 text-right font-medium">P/L</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.positions.map((p) => (
          <tr key={p.symbol} className="border-t border-border/60">
            <td className="py-1 font-medium">{p.symbol}</td>
            <td className="py-1 text-right tabular-nums">{formatQuantity(p.quantity)}</td>
            <td className="py-1 text-right tabular-nums">{usd(p.marketValueUsd)}</td>
            <td className="py-1 text-right tabular-nums">{usd(p.unrealizedPnlUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AccountsWidget() {
  const list = useAccountList();
  const hasAccounts = (list.data?.accounts.length ?? 0) > 0;
  const snapshots = useAccountSnapshots(hasAccounts);
  const refresh = useRefreshAccounts();
  const remove = useRemoveAccount();
  const dialogs = useFrameChrome().useDialogs();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | 'all'>('all');

  const snaps = snapshots.data?.snapshots ?? [];
  const current = selected === 'all' ? null : (snaps.find((s) => s.account.id === selected) ?? null);
  const byAsset = useMemo(
    () => (current ? donutSlices(current.allocation, true) : []),
    [current],
  );
  const byAccount = useMemo(() => donutSlices(snapshots.data?.byAccount ?? [], false), [snapshots.data?.byAccount]);

  if (list.isLoading) return <Skeleton className="h-40 w-full" />;
  if (list.isError) {
    return <EmptyState icon={LuLandmark} title="Accounts unavailable" body={list.error instanceof Error ? list.error.message : undefined} />;
  }
  const { connectors = [], accounts = [] } = list.data ?? {};

  const confirmRemove = (id: string, name: string): void =>
    dialogs.confirm({
      title: `Remove ${name}?`,
      body: 'The stored API key is deleted from the vault and the account is forgotten here. Nothing changes at the broker.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'secrets',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        setSelected('all');
        remove.mutate(id);
      },
    });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3" data-testid="accounts-widget">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Accounts</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">read-only</span>
        <div className="ml-auto flex items-center gap-1">
          {hasAccounts ? (
            <IconButton label="Refresh accounts" icon={LuRefreshCw} onClick={() => refresh.mutate()} disabled={refresh.isPending} />
          ) : null}
          <IconButton label="Connect account" icon={LuPlus} onClick={() => setAdding((v) => !v)} />
        </div>
      </div>

      {adding || !hasAccounts ? <AddAccountForm connectors={connectors} onDone={() => setAdding(false)} /> : null}

      {hasAccounts ? (
        <>
          <div role="tablist" aria-label="Accounts" className="flex flex-wrap gap-1">
            {[{ id: 'all', label: 'All' }, ...accounts.map((a) => ({ id: a.id, label: a.label }))].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={selected === tab.id}
                onClick={() => setSelected(tab.id)}
                className={`h-7 rounded-full px-3 text-xs ${selected === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {snapshots.isLoading ? <Skeleton className="h-24 w-full" /> : null}

          {selected === 'all' ? (
            <>
              <ul aria-label="Account balances" className="flex flex-col gap-1.5">
                {accounts.map((account) => {
                  const snap = snaps.find((s) => s.account.id === account.id);
                  return (
                    <li key={account.id} data-account={account.id} className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{account.label}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {account.connector}
                          {account.connector === 'alpaca' ? ` · ${account.environment}` : ''}
                        </span>
                        <span className="ml-auto tabular-nums">{snap ? usd(snap.totalUsd) : '…'}</span>
                      </div>
                      {snap?.error ? (
                        <p role="alert" className="text-xs text-destructive">
                          {snap.error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <Allocation slices={byAccount} label="By account" />
            </>
          ) : current ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">{usd(current.totalUsd)}</span>
                <IconButton
                  label={`Remove ${current.account.label}`}
                  icon={LuTrash2}
                  onClick={() => confirmRemove(current.account.id, current.account.label)}
                  className="ml-auto"
                />
              </div>
              {current.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {current.error}
                </p>
              ) : null}
              <ul aria-label="Balances" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {current.balances.map((b) => (
                  <li key={b.currency} className="tabular-nums">
                    <span className="font-medium">{b.currency}</span> {formatQuantity(b.total)}
                  </li>
                ))}
              </ul>
              <Performance snapshot={current} />
              <Allocation slices={byAsset} label="By asset" />
              <Positions snapshot={current} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
