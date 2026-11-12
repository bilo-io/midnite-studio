import { useState } from 'react';

import { formatAmount, LEDGER_REPORT_KINDS, type LedgerReport, type LedgerReportKind, type ReportRow } from '@midnite/studio-shared';

import { useLedgerCall, useReport } from './ledger-data';
import { presetRange, REPORT_RANGES, todayIso } from './ledger-math';
import { useLedgerUiStore, type ReportRange } from './ledger-ui-store';
import { BUTTON, ErrorLine, Field, INPUT } from './ledger-ui';
import { useActiveBook } from './overview';
import type { LedgerTab } from './ledger-workspace';

const KIND_LABEL: Record<LedgerReportKind, string> = {
  'trial-balance': 'Trial balance',
  'profit-and-loss': 'Profit and loss',
  'balance-sheet': 'Balance sheet',
  'cash-flow': 'Cash flow',
};

type Fmt = (minor: number) => string;
type OpenAccount = (accountId: string) => void;

function Head({ children }: { children: string }) {
  return (
    <tr>
      <th colSpan={2} scope="colgroup" className="pt-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {children}
      </th>
    </tr>
  );
}

function Lines({ rows, fmt, open }: { rows: readonly ReportRow[]; fmt: Fmt; open: OpenAccount }) {
  return (
    <>
      {rows.map((r, i) => (
        <tr key={r.accountId ?? `${r.name}-${i}`}>
          <td className="py-0.5 pl-4">
            {r.accountId ? (
              <button type="button" className="text-left hover:underline" onClick={() => open(r.accountId as string)}>
                {r.code} {r.name}
              </button>
            ) : (
              r.name
            )}
          </td>
          <td className="py-0.5 text-right tabular-nums">{fmt(r.minor)}</td>
        </tr>
      ))}
    </>
  );
}

function Total({ label, minor, fmt, strong }: { label: string; minor: number; fmt: Fmt; strong?: boolean }) {
  return (
    <tr className={`border-t border-border ${strong ? 'font-semibold' : 'font-medium'}`}>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right tabular-nums">{fmt(minor)}</td>
    </tr>
  );
}

function Alarm({ label, minor, fmt }: { label: string; minor: number; fmt: Fmt }) {
  return (
    <tr role="alert" className="font-medium text-red-600 dark:text-red-400">
      <td className="py-1">{label}</td>
      <td className="py-1 text-right tabular-nums">{fmt(minor)}</td>
    </tr>
  );
}

function ReportTable({ report, open }: { report: LedgerReport; open: OpenAccount }) {
  const fmt: Fmt = (minor) => formatAmount({ minor, currency: report.currency });
  if (report.kind === 'trial-balance') {
    return (
      <table className="w-full text-sm" aria-label="Trial balance">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 font-normal">Account</th>
            <th className="pb-1 text-right font-normal">Debit</th>
            <th className="pb-1 text-right font-normal">Credit</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.accountId}>
              <td className="py-0.5">
                <button type="button" className="text-left hover:underline" onClick={() => open(r.accountId)}>
                  {r.code} {r.name}
                </button>
              </td>
              <td className="py-0.5 text-right tabular-nums">{r.debit ? fmt(r.debit) : ''}</td>
              <td className="py-0.5 text-right tabular-nums">{r.credit ? fmt(r.credit) : ''}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="py-1">Total</td>
            <td className="py-1 text-right tabular-nums">{fmt(report.totalDebit)}</td>
            <td className="py-1 text-right tabular-nums">{fmt(report.totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    );
  }
  return (
    <table className="w-full text-sm" aria-label={KIND_LABEL[report.kind]}>
      <tbody>
        {report.kind === 'profit-and-loss' ? (
          <>
            <Head>Income</Head>
            <Lines rows={report.income} fmt={fmt} open={open} />
            <Total label="Total income" minor={report.incomeTotal} fmt={fmt} />
            <Head>Cost of sales</Head>
            <Lines rows={report.costOfSales} fmt={fmt} open={open} />
            <Total label="Total cost of sales" minor={report.costOfSalesTotal} fmt={fmt} />
            <Total label="Gross profit" minor={report.grossProfit} fmt={fmt} strong />
            <Head>Operating expenses</Head>
            <Lines rows={report.expenses} fmt={fmt} open={open} />
            <Total label="Total expenses" minor={report.expensesTotal} fmt={fmt} />
            <Total label="Net profit" minor={report.netProfit} fmt={fmt} strong />
          </>
        ) : null}
        {report.kind === 'balance-sheet' ? (
          <>
            <Head>Assets</Head>
            <Lines rows={report.assets} fmt={fmt} open={open} />
            <Total label="Total assets" minor={report.assetsTotal} fmt={fmt} strong />
            <Head>Liabilities</Head>
            <Lines rows={report.liabilities} fmt={fmt} open={open} />
            <Total label="Total liabilities" minor={report.liabilitiesTotal} fmt={fmt} />
            <Head>Equity</Head>
            <Lines rows={report.equity} fmt={fmt} open={open} />
            <Total label="Total equity" minor={report.equityTotal} fmt={fmt} />
            <Total label="Liabilities and equity" minor={report.liabilitiesTotal + report.equityTotal} fmt={fmt} strong />
            {report.difference !== 0 ? <Alarm label="Out of balance by" minor={report.difference} fmt={fmt} /> : null}
          </>
        ) : null}
        {report.kind === 'cash-flow' ? (
          <>
            <Head>Operating</Head>
            <tr>
              <td className="py-0.5 pl-4">Net profit</td>
              <td className="py-0.5 text-right tabular-nums">{fmt(report.netProfit)}</td>
            </tr>
            <Lines rows={report.operating} fmt={fmt} open={open} />
            <Total label="Cash from operating activities" minor={report.operatingTotal} fmt={fmt} />
            <Head>Investing</Head>
            <Lines rows={report.investing} fmt={fmt} open={open} />
            <Total label="Cash from investing activities" minor={report.investingTotal} fmt={fmt} />
            <Head>Financing</Head>
            <Lines rows={report.financing} fmt={fmt} open={open} />
            <Total label="Cash from financing activities" minor={report.financingTotal} fmt={fmt} />
            <Total label="Net change in cash" minor={report.netChange} fmt={fmt} strong />
            <tr>
              <td className="py-0.5">Cash at the start</td>
              <td className="py-0.5 text-right tabular-nums">{fmt(report.openingCash)}</td>
            </tr>
            <tr>
              <td className="py-0.5">Cash at the end</td>
              <td className="py-0.5 text-right tabular-nums">{fmt(report.closingCash)}</td>
            </tr>
            {report.unreconciled !== 0 ? <Alarm label="Unreconciled" minor={report.unreconciled} fmt={fmt} /> : null}
          </>
        ) : null}
      </tbody>
    </table>
  );
}

export function ReportsView({ onOpenTab }: { onOpenTab: (tab: LedgerTab) => void }) {
  const { bookId, detail } = useActiveBook();
  const call = useLedgerCall();
  const range = useLedgerUiStore((s) => s.reportRange);
  const setRange = useLedgerUiStore((s) => s.setReportRange);
  const setFilter = useLedgerUiStore((s) => s.setJournalFilter);
  const [kind, setKind] = useState<LedgerReportKind>('profit-and-loss');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const fiscal = detail.data?.book.fiscalYearStart ?? { month: 1, day: 1 };
  const span = range === 'custom' ? custom : (presetRange(range, todayIso(), fiscal) ?? custom);
  const report = useReport(bookId, kind, span.from, span.to);

  if (bookId === null) return <p role="status" className="text-sm text-muted-foreground">Create a book on the Overview tab first.</p>;
  if (detail.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  if (detail.isError) return <ErrorLine error={{ kind: detail.error.kind, message: detail.error.message }} />;

  const openAccount: OpenAccount = (accountId) => {
    setFilter({ accountId });
    onOpenTab('journal');
  };
  const backwards = span.from !== '' && span.to !== '' && span.from > span.to;
  const asOfOnly = kind === 'trial-balance' || kind === 'balance-sheet';

  const exportCsv = async (): Promise<void> => {
    setNote(null);
    const r = await call((api) => api.exportReport({ bookId, kind, from: span.from, to: span.to }));
    if (!r.ok) setNote({ tone: 'error', text: r.message });
    else if (r.value.path !== null) setNote({ tone: 'ok', text: 'Report saved.' });
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Report">
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as LedgerReportKind)}>
            {LEDGER_REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Period">
          <select className={INPUT} value={range} onChange={(e) => setRange(e.target.value as ReportRange)}>
            {REPORT_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        {range === 'custom' ? (
          <>
            {asOfOnly ? null : (
              <Field label="From">
                <input className={INPUT} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              </Field>
            )}
            <Field label={asOfOnly ? 'As of' : 'To'}>
              <input className={INPUT} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value, ...(asOfOnly ? { from: e.target.value } : {}) })} />
            </Field>
          </>
        ) : null}
        <button type="button" className={BUTTON} disabled={!report.isSuccess} onClick={() => void exportCsv()}>
          Export CSV
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {span.from === '' || span.to === '' ? 'Choose a period.' : asOfOnly ? `As of ${span.to}` : `${span.from} to ${span.to}`}
      </p>
      {backwards ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">The start date is after the end date.</p> : null}
      {report.isPending && report.fetchStatus !== 'idle' ? <p role="status" className="text-sm text-muted-foreground">Building the report…</p> : null}
      {report.isError ? <ErrorLine error={{ kind: report.error.kind, message: report.error.message }} /> : null}
      {report.data ? <ReportTable report={report.data} open={openAccount} /> : null}
      {note ? (
        <p role={note.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${note.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
