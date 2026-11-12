import { useState } from 'react';

import { formatAmount, lineNet, minorUnitsOf, totals, type CompanyProfile, type Customer, type Invoice } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { useStartupWrite } from '../data/use-startup';
import { decimalToInt, intToDecimal } from './decimal';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';
const BUTTON = 'h-8 rounded-md border border-border px-3 text-sm disabled:opacity-50';

type Row = { description: string; quantity: string; unit: string; tax: string };

const rowOf = (line: Invoice['lines'][number], currency: string): Row => ({
  description: line.description,
  quantity: String(line.quantityMilli / 1000),
  unit: intToDecimal(line.unitMinor, minorUnitsOf(currency)),
  tax: String(line.taxRateBp / 100),
});

/** Rows as typed to invoice lines, or the first thing wrong with them, in words. */
function parseRows(rows: readonly Row[], currency: string): { lines: Invoice['lines'] } | { problem: string } {
  const lines: Invoice['lines'] = [];
  for (const [i, row] of rows.entries()) {
    const label = `Line ${i + 1}`;
    const quantityMilli = decimalToInt(row.quantity, 3);
    const unitMinor = decimalToInt(row.unit, minorUnitsOf(currency));
    const taxRateBp = decimalToInt(row.tax === '' ? '0' : row.tax, 2);
    if (row.description.trim() === '') return { problem: `${label} needs a description.` };
    if (quantityMilli === null || quantityMilli <= 0) return { problem: `${label}: quantity must be a positive number with at most 3 decimals.` };
    if (unitMinor === null) return { problem: `${label}: the unit price must be a number with at most ${minorUnitsOf(currency)} decimals.` };
    if (taxRateBp === null || taxRateBp > 10000) return { problem: `${label}: tax must be between 0 and 100 %.` };
    lines.push({ description: row.description.trim(), quantityMilli, unitMinor, taxRateBp });
  }
  return { lines };
}

type Props = {
  invoice: Invoice | null;
  customers: readonly Customer[];
  company: CompanyProfile;
  /** The linked book's name, or `null` when no book is linked. */
  bookName: string | null;
  today: string;
  onClose: () => void;
};

/**
 * One invoice: an editor while it is a draft, a read-only statement once issued. Issuing, paying and voiding each
 * confirm with what will be posted to the books before anything is sent; a refusal from main shows as it arrives.
 */
export function InvoiceSheet({ invoice, customers, company, bookName, today, onClose }: Props) {
  const dialogs = STARTUP_CHROME.useDialogs();
  const save = useStartupWrite((bridge, next: Invoice) => bridge.upsertInvoice({ invoice: next }));
  const issue = useStartupWrite((bridge, args: { invoice: Invoice; issueDate: string }) =>
    bridge.upsertInvoice({ invoice: args.invoice }).then((r) => (r.ok ? bridge.issueInvoice({ id: args.invoice.id, issueDate: args.issueDate }) : r)),
  );
  const pay = useStartupWrite((bridge, args: { id: string; paidDate: string }) => bridge.markPaid(args));
  const voidIt = useStartupWrite((bridge, args: { id: string; reason: string }) => bridge.voidInvoice(args));
  const exportPdf = useStartupWrite((bridge, id: string) => bridge.exportInvoicePdf({ id }));

  const editable = invoice === null || invoice.status === 'draft';
  const [id] = useState(() => invoice?.id ?? crypto.randomUUID());
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? customers[0]?.id ?? '');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [rows, setRows] = useState<Row[]>(invoice ? invoice.lines.map((l) => rowOf(l, company.currency)) : [{ description: '', quantity: '1', unit: '', tax: '0' }]);
  const [issueDate, setIssueDate] = useState(today);
  const [paidDate, setPaidDate] = useState(today);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const money = (minor: number): string => formatAmount({ minor, currency: company.currency }, 'en-GB');
  const parsed = parseRows(rows, company.currency);
  const live = 'lines' in parsed ? totals(parsed) : null;
  const shown = invoice !== null && !editable ? totals(invoice) : live;
  const customerName = customers.find((c) => c.id === (invoice?.customerId ?? customerId))?.name ?? 'Unknown customer';
  const fail = (e: { message: string }): void => setProblem(e.message);

  function draft(): Invoice | null {
    if (customerId === '') {
      setProblem('Add a customer first, then pick them here.');
      return null;
    }
    if ('problem' in parsed) {
      setProblem(parsed.problem);
      return null;
    }
    setProblem(null);
    return { id, number: null, customerId, issueDate: null, dueDate: null, lines: parsed.lines, notes, status: 'draft', entries: {} };
  }

  function submit(): void {
    const next = draft();
    if (next !== null) save.mutate(next, { onSuccess: onClose, onError: fail });
  }

  function confirmIssue(): void {
    const next = draft();
    if (next === null || live === null) return;
    dialogs.confirm({
      title: 'Issue this invoice?',
      body: `Posts ${money(live.totalMinor)} to ${bookName ?? 'the linked book'}: receivable, sales${live.taxMinor > 0 ? ', tax' : ''}. It gets the next invoice number and can no longer be edited.`,
      confirmLabel: 'Issue invoice',
      onConfirm: () => issue.mutate({ invoice: next, issueDate }, { onSuccess: onClose, onError: fail }),
    });
  }

  function confirmPay(): void {
    if (invoice === null || shown === null) return;
    dialogs.confirm({
      title: `Mark ${invoice.number ?? 'invoice'} paid?`,
      body: `Posts ${money(shown.totalMinor)} to ${bookName ?? 'the linked book'}: bank, receivable.`,
      confirmLabel: 'Mark paid',
      onConfirm: () => pay.mutate({ id: invoice.id, paidDate }, { onSuccess: onClose, onError: fail }),
    });
  }

  function confirmVoid(): void {
    if (invoice === null) return;
    if (reason.trim() === '') return setProblem('Give a reason for voiding it.');
    dialogs.confirm({
      title: `Void ${invoice.number ?? 'invoice'}?`,
      body: `Reverses the entry in ${bookName ?? 'the linked book'}. The number stays used and the invoice is kept, marked VOID.`,
      confirmLabel: 'Void invoice',
      danger: true,
      onConfirm: () => voidIt.mutate({ id: invoice.id, reason: reason.trim() }, { onSuccess: onClose, onError: fail }),
    });
  }

  function doExport(): void {
    setNote(null);
    exportPdf.mutate(invoice?.id ?? id, {
      onSuccess: (value) => setNote((value as { saved: boolean }).saved ? 'PDF saved.' : null),
      onError: fail,
    });
  }

  const setRow = (i: number, patch: Partial<Row>): void => setRows((current) => current.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const status = invoice?.status ?? 'draft';
  const label = invoice === null ? 'New invoice' : invoice.number ?? 'Draft invoice';

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={label}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{label}</h2>
        {status === 'void' ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-500">VOID</span> : null}
        {status === 'paid' ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">PAID</span> : null}
      </div>

      <label className={LABEL}>
        Customer
        {editable ? (
          <select className={FIELD} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.length === 0 ? <option value="">No customers yet</option> : null}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-foreground">{customerName}</span>
        )}
      </label>

      {invoice !== null && !editable ? (
        <p className="text-xs text-muted-foreground">
          Issued {invoice.issueDate} · Due {invoice.dueDate}
          {invoice.paidDate !== undefined ? ` · Paid ${invoice.paidDate}` : ''}
          {invoice.voidReason !== undefined ? ` · ${invoice.voidReason}` : ''}
        </p>
      ) : null}

      <div className="flex flex-col gap-2" role="group" aria-label="Lines">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_3.5rem_5rem_3rem] gap-1">
            <input aria-label={`Description ${i + 1}`} className={FIELD} placeholder="Description" value={row.description} maxLength={200} disabled={!editable} onChange={(e) => setRow(i, { description: e.target.value })} />
            <input aria-label={`Quantity ${i + 1}`} className={FIELD} value={row.quantity} disabled={!editable} inputMode="decimal" onChange={(e) => setRow(i, { quantity: e.target.value })} />
            <input aria-label={`Unit price ${i + 1}`} className={FIELD} value={row.unit} disabled={!editable} inputMode="decimal" placeholder="0.00" onChange={(e) => setRow(i, { unit: e.target.value })} />
            <input aria-label={`Tax % ${i + 1}`} className={FIELD} value={row.tax} disabled={!editable} inputMode="decimal" onChange={(e) => setRow(i, { tax: e.target.value })} />
            {'lines' in parsed && parsed.lines[i] !== undefined ? <span className="col-span-4 text-right text-[11px] text-muted-foreground">{money(lineNet(parsed.lines[i]))}</span> : null}
          </div>
        ))}
        {editable ? (
          <button type="button" className="self-start text-xs text-muted-foreground" onClick={() => setRows((r) => [...r, { description: '', quantity: '1', unit: '', tax: '0' }])}>
            Add line
          </button>
        ) : null}
      </div>

      {shown !== null ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-sm" aria-label="Totals">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right">{money(shown.netMinor)}</dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right">{money(shown.taxMinor)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{money(shown.totalMinor)}</dd>
        </dl>
      ) : null}

      <label className={LABEL}>
        Notes
        <textarea className={`${FIELD} h-14 py-1`} value={notes} maxLength={1000} disabled={!editable} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {status === 'draft' ? (
        <label className={LABEL}>
          Issue date
          <input className={FIELD} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
      ) : null}
      {status === 'issued' ? (
        <>
          <label className={LABEL}>
            Paid on
            <input className={FIELD} type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </label>
          <label className={LABEL}>
            Reason for voiding
            <input className={FIELD} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      ) : null}

      {problem !== null ? (
        <p role="alert" className="text-xs text-red-500">
          {problem}
        </p>
      ) : null}
      {note !== null ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {status === 'draft' && bookName === null ? <p className="text-xs text-muted-foreground">Link a book in Settings ▸ Company to issue invoices.</p> : null}

      <div className="flex flex-wrap gap-2">
        {status === 'draft' ? (
          <>
            <button type="button" className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={save.isPending} onClick={submit}>
              Save draft
            </button>
            <button type="button" className={BUTTON} disabled={bookName === null || issue.isPending} title={bookName === null ? 'Link a book in Settings ▸ Company to issue invoices.' : undefined} onClick={confirmIssue}>
              Issue
            </button>
          </>
        ) : null}
        {status === 'issued' ? (
          <>
            <button type="button" className={BUTTON} disabled={pay.isPending} onClick={confirmPay}>
              Mark paid
            </button>
            <button type="button" className={`${BUTTON} text-red-500`} disabled={voidIt.isPending} onClick={confirmVoid}>
              Void
            </button>
          </>
        ) : null}
        {invoice !== null ? (
          <button type="button" className={BUTTON} disabled={exportPdf.isPending} onClick={doExport}>
            Export PDF
          </button>
        ) : null}
        <button type="button" className={`${BUTTON} ml-auto`} onClick={onClose}>
          Close
        </button>
      </div>
    </aside>
  );
}
