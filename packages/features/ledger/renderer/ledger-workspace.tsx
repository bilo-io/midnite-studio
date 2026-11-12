import { useState } from 'react';

import { Accounts } from './accounts';
import { useLedgerSync } from './ledger-data';
import { useLedgerUiStore } from './ledger-ui-store';
import { ImportView } from './import-view';
import { Journal } from './journal';
import { Overview } from './overview';
import { ReportsView } from './reports-view';

export const LEDGER_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'journal', label: 'Journal' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'reports', label: 'Reports' },
  { id: 'tax', label: 'Tax' },
  { id: 'import', label: 'Import' },
] as const;

export type LedgerTab = (typeof LEDGER_TABS)[number]['id'];

/**
 * The books workspace: one component with an internal tab strip, because Studio has one view per feature
 * (a suite host drives `tab` from its own rail and hides the strip). Overview, Journal, Accounts, Reports and
 * Import are filled; Tax arrives with Theme G.
 */
export function LedgerWorkspace({ tab, onTabChange, showTabs = true }: { tab?: LedgerTab; onTabChange?: (tab: LedgerTab) => void; showTabs?: boolean }) {
  const [own, setOwn] = useState<LedgerTab>('overview');
  const active = tab ?? own;
  useLedgerSync();
  const setSettingsOpen = useLedgerUiStore((st) => st.setSettingsOpen);
  const select = (next: LedgerTab): void => {
    setOwn(next);
    onTabChange?.(next);
  };
  const openSettings = (): void => {
    setSettingsOpen(true);
    select('overview');
  };
  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Books">
      {showTabs ? (
        <div role="tablist" aria-label="Books sections" className="flex gap-1 border-b border-border px-4 py-2">
          {LEDGER_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active === t.id}
              onClick={() => select(t.id)}
              className={`rounded-md px-3 py-1 text-sm ${active === t.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <main className="min-h-0 flex-1 overflow-auto p-6" aria-label={LEDGER_TABS.find((t) => t.id === active)?.label}>
        {active === 'overview' ? <Overview onOpenTab={select} /> : null}
        {active === 'journal' ? <Journal onOpenSettings={openSettings} /> : null}
        {active === 'accounts' ? <Accounts /> : null}
        {active === 'import' ? <ImportView /> : null}
        {active === 'reports' ? <ReportsView onOpenTab={select} /> : null}
        {active === 'tax' ? (
          <section role="status" className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h2 className="text-base font-medium">Coming next</h2>
            <p className="mt-2 text-sm text-muted-foreground">This section arrives in a later update.</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
