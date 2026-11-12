import { useState } from 'react';

import { formatAmount, TAX_JURISDICTIONS, TAX_NOTICE, taxYearStart, type TaxJurisdictionId } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';

import { LedgerOpError, useLedgerCall, ledgerApi } from './ledger-data';
import { todayIso } from './ledger-math';
import { ErrorLine, Field, INPUT } from './ledger-ui';
import { useActiveBook } from './overview';
import type { LedgerTaxEstimate } from '@midnite/studio-shared';

const JURISDICTION_IDS = Object.keys(TAX_JURISDICTIONS) as TaxJurisdictionId[];

/** Rates are shown as a percentage from basis points: 2000 is `20%`, 150 is `1.5%`. */
const percent = (bp: number): string => `${bp / 100}%`;

/** The fixed notice, shown in every state of the view; the long form carries the rules label and dates. */
function Notice({ children }: { children: string }) {
  return (
    <p role="note" aria-label="Not tax advice" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      {children}
    </p>
  );
}

/** The tax year that contains `today`: 6 April starts it. */
function currentStartYear(today: string): number {
  const year = Number(today.slice(0, 4));
  return today >= `${year}-04-06` ? year : year - 1;
}

function EstimateTable({ est }: { est: LedgerTaxEstimate }) {
  const fmt = (minor: number): string => formatAmount({ minor, currency: est.currency });
  const e = est.estimate;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {est.entity === 'company' ? 'Financial year' : 'Tax year'} {est.taxYear}: {est.from} to {est.to}
      </p>
      <table className="w-full text-sm" aria-label="Tax estimate inputs">
        <tbody>
          <tr>
            <td className="py-0.5">Profit for the year</td>
            <td className="py-0.5 text-right tabular-nums">{fmt(est.profitMinor)}</td>
          </tr>
          <tr>
            <td className="py-0.5">Disallowable expenses added back</td>
            <td className="py-0.5 text-right tabular-nums">{fmt(est.disallowableMinor)}</td>
          </tr>
          <tr className="border-t border-border font-medium">
            <td className="py-1">Taxable profit</td>
            <td className="py-1 text-right tabular-nums">{fmt(est.taxableProfitMinor)}</td>
          </tr>
        </tbody>
      </table>
      <table className="w-full text-sm" aria-label="Tax estimate">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 font-normal">Charge</th>
            <th className="pb-1 text-right font-normal">On</th>
            <th className="pb-1 text-right font-normal">Rate</th>
            <th className="pb-1 text-right font-normal">Tax</th>
          </tr>
        </thead>
        <tbody>
          {e.lines.map((l) => (
            <tr key={l.label}>
              <td className="py-0.5">{l.label}</td>
              <td className="py-0.5 text-right tabular-nums">{fmt(l.basisMinor)}</td>
              <td className="py-0.5 text-right tabular-nums">{percent(l.rateBp)}</td>
              <td className="py-0.5 text-right tabular-nums">{fmt(l.taxMinor)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="py-1" colSpan={3}>
              Estimated tax ({percent(e.effectiveRateBp)} of taxable profit)
            </td>
            <td className="py-1 text-right tabular-nums">{fmt(e.totalMinor)}</td>
          </tr>
        </tbody>
      </table>
      {e.lines.length === 0 ? <p className="text-sm text-muted-foreground">No tax is due on this profit.</p> : null}
      {e.payments.length > 0 ? (
        <section aria-label="Payment dates">
          <h3 className="text-sm font-medium">Payment dates</h3>
          <ul className="mt-1 grid gap-0.5 text-sm">
            {e.payments.map((p) => (
              <li key={p.due} className="flex justify-between gap-4">
                <span>
                  {p.due} · {p.label}
                </span>
                <span className="tabular-nums">{fmt(p.minor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label="Notes">
        <h3 className="text-sm font-medium">Notes</h3>
        <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
          {e.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Source: {e.source.url} · {e.source.checkedOn}
        </p>
      </section>
    </div>
  );
}

export function TaxView() {
  const { bookId, detail } = useActiveBook();
  const call = useLedgerCall();
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);

  const book = detail.data?.book;
  const jurisdiction = book?.jurisdiction ? TAX_JURISDICTIONS[book.jurisdiction] : null;
  const available = book && book.entity !== 'personal' && jurisdiction !== null && jurisdiction.entities.includes(book.entity);
  const years = jurisdiction ? jurisdiction.taxYears.map(taxYearStart) : [];
  const current = currentStartYear(todayIso());
  const startYear = picked !== null && years.includes(picked) ? picked : years.includes(current) ? current : (years[0] ?? current);

  const estimate = useQuery<LedgerTaxEstimate, LedgerOpError>({
    queryKey: ['ledger', bookId, 'taxEstimate', startYear],
    queryFn: async () => {
      const api = ledgerApi();
      if (!api) throw new LedgerOpError('io', 'Books are not available in this window.');
      const r = await api.taxEstimate({ bookId: bookId as string, taxYear: startYear });
      if (!r.ok) throw new LedgerOpError(r.kind, r.message);
      return r.value;
    },
    enabled: bookId !== null && Boolean(available),
    staleTime: 30_000,
  });

  if (bookId === null) return <div className="grid max-w-3xl gap-4"><Notice>{TAX_NOTICE}</Notice><p role="status" className="text-sm text-muted-foreground">Create a book on the Overview tab first.</p></div>;
  if (detail.isPending) return <div className="grid max-w-3xl gap-4"><Notice>{TAX_NOTICE}</Notice><p role="status" className="text-sm text-muted-foreground">Loading…</p></div>;
  if (detail.isError || !book) return <div className="grid max-w-3xl gap-4"><Notice>{TAX_NOTICE}</Notice><ErrorLine error={detail.error ? { kind: detail.error.kind, message: detail.error.message } : null} /></div>;

  const setJurisdiction = async (value: string): Promise<void> => {
    setError(null);
    const r = await call((api) => api.updateBook({ bookId: book.id, patch: { jurisdiction: value === '' ? null : (value as TaxJurisdictionId) } }));
    if (!r.ok) setError(r);
  };

  const JurisdictionField = (
    <Field label="Tax jurisdiction">
      <select className={INPUT} value={book.jurisdiction ?? ''} disabled={detail.data.readOnly} onChange={(e) => void setJurisdiction(e.target.value)}>
        <option value="">None</option>
        {JURISDICTION_IDS.map((id) => (
          <option key={id} value={id}>
            {TAX_JURISDICTIONS[id].label}
          </option>
        ))}
      </select>
    </Field>
  );

  if (book.entity === 'personal') {
    return (
      <div className="grid max-w-3xl gap-4">
        <Notice>{TAX_NOTICE}</Notice>
        <p role="status" className="text-sm text-muted-foreground">Tax estimates are not available for a personal book. Use a sole-trader or company book to estimate the tax on trading profit.</p>
      </div>
    );
  }

  if (!jurisdiction) {
    return (
      <div className="grid max-w-md gap-4">
        <Notice>{TAX_NOTICE}</Notice>
        <section role="status" className="grid gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-medium">Choose a tax jurisdiction</h2>
          <p className="text-sm text-muted-foreground">An estimate needs the rules to apply. Pick one for this book.</p>
          {JurisdictionField}
          <ErrorLine error={error} />
        </section>
      </div>
    );
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Notice>{estimate.data?.disclaimer ?? TAX_NOTICE}</Notice>
      <div className="flex flex-wrap items-end gap-3">
        {JurisdictionField}
        <Field label="Tax year">
          <select className={INPUT} value={startYear} onChange={(e) => setPicked(Number(e.target.value))}>
            {jurisdiction.taxYears.map((label) => (
              <option key={label} value={taxYearStart(label)}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorLine error={error} />
      {estimate.isPending && estimate.fetchStatus !== 'idle' ? <p role="status" className="text-sm text-muted-foreground">Estimating…</p> : null}
      {estimate.isError ? <ErrorLine error={{ kind: estimate.error.kind, message: estimate.error.message }} /> : null}
      {estimate.data ? <EstimateTable est={estimate.data} /> : null}
    </div>
  );
}
