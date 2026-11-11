import { useState } from 'react';

import { contractStatus, currentTermEnd, noticeDeadline, type CompanyProfile, type Contract, type Vendor } from '@midnite/studio-shared';

import { ContractSheet } from './contract-sheet';
import { VendorSheet } from './vendor-sheet';

const today = (): string => new Date().toISOString().slice(0, 10);

type Tab = 'vendors' | 'contracts';
type Sheet = { kind: 'vendor'; vendor: Vendor | null } | { kind: 'contract'; contract: Contract | null };

const STATUS_STYLE = { active: '', 'notice-due': 'bg-amber-500/15 text-amber-500', ending: 'bg-amber-500/15 text-amber-500', ended: 'bg-zinc-500/20 text-muted-foreground' } as const;

/** Vendors and contracts, with an Action needed strip for notice deadlines and endings inside 30 days. */
export function VendorsView({ company, vendors, contracts }: { company: CompanyProfile; vendors: readonly Vendor[]; contracts: readonly Contract[] }) {
  const [tab, setTab] = useState<Tab>('vendors');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const now = today();
  const vendorName = (id: string): string => vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';
  const statuses = contracts.map((c) => ({ contract: c, status: contractStatus(c, now) }));
  const action = statuses.filter((s) => s.status === 'notice-due' || s.status === 'ending');

  return (
    <main className="flex h-full min-h-0" aria-label="Vendors">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Vendors</h1>
          <div role="tablist" aria-label="Vendors and contracts" className="ml-4 flex overflow-hidden rounded-md border border-border text-xs">
            {(['vendors', 'contracts'] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`px-3 py-1 capitalize ${tab === value ? 'bg-accent' : 'text-muted-foreground'}`}>
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSheet(tab === 'vendors' ? { kind: 'vendor', vendor: null } : { kind: 'contract', contract: null })}
            className="ml-auto h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {tab === 'vendors' ? 'Add vendor' : 'Add contract'}
          </button>
        </div>

        {action.length > 0 ? (
          <section aria-label="Action needed" className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-amber-500">Action needed</h2>
            {action.map(({ contract, status }) => (
              <button key={contract.id} type="button" onClick={() => setSheet({ kind: 'contract', contract })} className="flex items-center gap-2 text-left text-sm">
                <span className="flex-1 truncate">{contract.title}</span>
                <span className="text-xs text-muted-foreground">
                  {status === 'notice-due' ? `Give notice by ${noticeDeadline(contract, now) ?? ''}` : `Ends ${currentTermEnd(contract, now) ?? ''}`}
                </span>
              </button>
            ))}
          </section>
        ) : null}

        {tab === 'vendors' ? (
          vendors.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-8">
              <p className="text-sm font-medium">No vendors yet</p>
              <p className="text-xs text-muted-foreground">Add the suppliers you pay, then attach their contracts.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {vendors.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setSheet({ kind: 'vendor', vendor: v })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60">
                    <span className="flex-1 truncate">{v.name}</span>
                    <span className="text-xs text-muted-foreground">{v.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">No contracts yet</p>
            <p className="text-xs text-muted-foreground">Track terms, renewals and notice dates, with the signed file kept alongside.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {statuses.map(({ contract, status }) => (
              <li key={contract.id}>
                <button type="button" onClick={() => setSheet({ kind: 'contract', contract })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60">
                  <span className="flex-1 truncate">{contract.title}</span>
                  <span className="text-xs text-muted-foreground">{vendorName(contract.counterparty.id)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[status]}`}>{status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sheet?.kind === 'vendor' ? <VendorSheet key={sheet.vendor?.id ?? 'new'} vendor={sheet.vendor} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'contract' ? <ContractSheet key={sheet.contract?.id ?? 'new'} contract={sheet.contract} vendors={vendors} currency={company.currency} onClose={() => setSheet(null)} /> : null}
    </main>
  );
}
