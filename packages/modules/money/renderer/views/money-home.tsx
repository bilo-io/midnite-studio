import { useEffect, type ReactNode } from 'react';
import { PiChartLineUpFill } from 'react-icons/pi';

import {
  AccountsWidget,
  AllocationWidget,
  AssetListWidget,
  BankCardsWidget,
  BigChartWidget,
  FinanceHeaderControls,
  NewsWidget,
  TransactionsWidget,
  useFinanceStore,
} from '@midnite/studio-feature-finance/renderer';

import { MONEY_APP } from '../money-manifest';

/** What the empty state says when the vault refuses Money the market-data key (or holds none). */
export const GRANT_HINT =
  'Stocks need the market-data key — grant Money access to the market-data key in Vault. Crypto and the markets board work without it.';

function Card({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={`flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      {children}
    </section>
  );
}

/**
 * What Money shows on open — its own portfolio and markets board, not Studio's dashboard: the
 * accent mark and name, the timescale and currency controls, then the finance feature's cards.
 * Whether the market-data key is readable is asked of main (`secrets.has`, a boolean); the key
 * itself never reaches this window.
 */
export function MoneyHome() {
  const hydrated = useFinanceStore((s) => s.secretsHydrated);
  const keyConfigured = useFinanceStore((s) => s.twelveDataKeyConfigured);
  const hydrateSecrets = useFinanceStore((s) => s.hydrateSecrets);
  useEffect(() => {
    void hydrateSecrets();
  }, [hydrateSecrets]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: MONEY_APP.accent }}
        >
          <PiChartLineUpFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{MONEY_APP.name}</p>
        <div className="ml-auto">
          <FinanceHeaderControls />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-4" aria-label="Money">
        {hydrated && !keyConfigured ? (
          <p role="status" className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {GRANT_HINT}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card label="Chart" className="min-h-[420px] lg:col-span-2">
            <BigChartWidget />
          </Card>
          <Card label="Cards">
            <BankCardsWidget />
          </Card>
          <Card label="Watchlist">
            <AssetListWidget list="watchlist" />
          </Card>
          <Card label="Markets">
            <AssetListWidget list="markets" />
          </Card>
          <Card label="Accounts" className="min-h-[380px] lg:col-span-2">
            <AccountsWidget />
          </Card>
          <Card label="Allocation">
            <AllocationWidget />
          </Card>
          <Card label="News" className="lg:col-span-2">
            <NewsWidget />
          </Card>
          <Card label="Transactions">
            <TransactionsWidget />
          </Card>
        </div>
      </main>
    </div>
  );
}
