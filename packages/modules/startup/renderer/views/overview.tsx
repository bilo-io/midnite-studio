import type { ReactNode } from 'react';

import { BASE_SCENARIO_ID, contractStatus, formatAmount, totals, type CompanyProfile, type Contract, type Invoice, type Milestone, type PlanLine } from '@midnite/studio-shared';

import { displayStatus } from '../invoices/invoice-status';
import { useLedgerSummary } from '../ledger/use-summary';
import { runwayLabel } from '../runway/runway-types';
import { useProjection } from '../runway/use-projection';

const today = (): string => new Date().toISOString().slice(0, 10);

function Card({ title, view, onView, children }: { title: string; view: string; onView: (view: string) => void; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onView(view)} aria-label={title} className="flex min-w-56 flex-1 flex-col gap-1 rounded-md border border-border p-4 text-left hover:bg-accent/40">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
      {children}
    </button>
  );
}

type Props = {
  company: CompanyProfile;
  milestones: readonly Milestone[];
  lines: readonly PlanLine[];
  invoices: readonly Invoice[];
  contracts: readonly Contract[];
  linked: boolean;
  onView: (view: string) => void;
};

/** The company at a glance: cash today, runway, the next milestones, what customers owe late, and contracts to act on. Each card opens its view. */
export function Overview({ company, milestones, invoices, contracts, linked, onView }: Props) {
  const now = today();
  const summary = useLedgerSummary(linked);
  const projection = useProjection(BASE_SCENARIO_ID, 36);
  const money = (minor: number): string => formatAmount({ minor, currency: company.currency }, 'en-GB');
  const book = summary.data ?? null;
  const next = milestones
    .filter((m) => m.status === 'planned' || m.status === 'in-progress')
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 3);
  const overdue = invoices.filter((i) => displayStatus(i, now) === 'overdue');
  const overdueTotal = overdue.reduce((sum, i) => sum + totals(i).totalMinor, 0);
  const action = contracts.filter((c) => {
    const status = contractStatus(c, now);
    return status === 'notice-due' || status === 'ending';
  });

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6" aria-label="Overview">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{company.name}</p>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
      </div>
      <div className="flex flex-wrap gap-3">
        <Card title="Cash today" view="startup.runway" onView={onView}>
          <span className="text-lg font-semibold">{money(book?.cashMinor ?? company.openingCash.minor)}</span>
          <span className="text-xs text-muted-foreground">{book !== null ? `From ${book.bookName}` : `Opening cash, ${company.openingCash.asOf}`}</span>
        </Card>
        <Card title="Runway" view="startup.runway" onView={onView}>
          <span className="text-lg font-semibold">{projection.data ? runwayLabel(projection.data.runwayMonths, 36) : '…'}</span>
          <span className="text-xs text-muted-foreground">{projection.data ? (projection.data.defaultAlive ? 'Default alive' : 'Default dead') : ' '}</span>
        </Card>
        <Card title="Next milestones" view="startup.roadmap" onView={onView}>
          {next.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nothing planned</span>
          ) : (
            next.map((m) => (
              <span key={m.id} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{m.title}</span>
                <span className="text-xs text-muted-foreground">{m.due}</span>
              </span>
            ))
          )}
        </Card>
        <Card title="Overdue invoices" view="startup.invoices" onView={onView}>
          <span className={`text-lg font-semibold ${overdue.length > 0 ? 'text-amber-500' : ''}`}>{money(overdueTotal)}</span>
          <span className="text-xs text-muted-foreground">{overdue.length === 0 ? 'None overdue' : `${overdue.length} ${overdue.length === 1 ? 'invoice' : 'invoices'}`}</span>
        </Card>
        <Card title="Contracts needing action" view="startup.vendors" onView={onView}>
          <span className={`text-lg font-semibold ${action.length > 0 ? 'text-amber-500' : ''}`}>{action.length}</span>
          <span className="text-xs text-muted-foreground">{action.length === 0 ? 'Nothing to do' : 'Notice or ending soon'}</span>
        </Card>
      </div>
    </main>
  );
}
