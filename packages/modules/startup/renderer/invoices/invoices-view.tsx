import { useState } from 'react';

import { formatAmount, totals, type CompanyProfile, type Customer, type Invoice } from '@midnite/studio-shared';

import { useBooks } from '../ledger/use-books';
import { CustomerSheet } from './customer-sheet';
import { INVOICE_FILTERS, displayStatus, matchesFilter, type InvoiceFilter } from './invoice-status';
import { InvoiceSheet } from './invoice-sheet';

const today = (): string => new Date().toISOString().slice(0, 10);

type Tab = 'invoices' | 'customers';
type Sheet = { kind: 'invoice'; invoice: Invoice | null } | { kind: 'customer'; customer: Customer | null };

const STATUS_STYLE: Record<ReturnType<typeof displayStatus>, string> = {
  draft: 'bg-zinc-500/20 text-muted-foreground',
  issued: 'bg-sky-500/15 text-sky-500',
  overdue: 'bg-amber-500/15 text-amber-500',
  paid: 'bg-emerald-500/15 text-emerald-500',
  void: 'bg-red-500/15 text-red-500',
};

/** Invoices and Customers. Issue needs a linked book: the button says so rather than failing after a click. */
export function InvoicesView({ company, customers, invoices, bookId }: { company: CompanyProfile; customers: readonly Customer[]; invoices: readonly Invoice[]; bookId: string | null }) {
  const [tab, setTab] = useState<Tab>('invoices');
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const books = useBooks();
  const bookName = bookId === null ? null : (books.data?.find((b) => b.id === bookId)?.name ?? 'the linked book');
  const now = today();
  const customerName = (id: string): string => customers.find((c) => c.id === id)?.name ?? 'Unknown customer';
  const money = (minor: number): string => formatAmount({ minor, currency: company.currency }, 'en-GB');
  const visible = invoices.filter((i) => matchesFilter(i, filter, now));

  return (
    <main className="flex h-full min-h-0" aria-label="Invoices">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Invoices</h1>
          <div role="tablist" aria-label="Invoices and customers" className="ml-4 flex overflow-hidden rounded-md border border-border text-xs">
            {(['invoices', 'customers'] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`px-3 py-1 capitalize ${tab === value ? 'bg-accent' : 'text-muted-foreground'}`}>
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSheet(tab === 'invoices' ? { kind: 'invoice', invoice: null } : { kind: 'customer', customer: null })}
            className="ml-auto h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {tab === 'invoices' ? 'New invoice' : 'Add customer'}
          </button>
        </div>

        {tab === 'invoices' ? (
          <>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Status
              <select aria-label="Status filter" className="h-8 rounded-md border border-border bg-background px-2 text-sm capitalize text-foreground" value={filter} onChange={(e) => setFilter(e.target.value as InvoiceFilter)}>
                {INVOICE_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            {bookName === null ? <p className="text-xs text-muted-foreground">Link a book in Settings ▸ Company to issue invoices.</p> : null}
            {invoices.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-8">
                <p className="text-sm font-medium">No invoices yet</p>
                <p className="text-xs text-muted-foreground">{customers.length === 0 ? 'Add a customer, then draft your first invoice.' : 'Draft an invoice; issuing it posts to your books.'}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Number</th>
                    <th className="font-medium">Customer</th>
                    <th className="font-medium">Issued</th>
                    <th className="font-medium">Due</th>
                    <th className="text-right font-medium">Total</th>
                    <th className="pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => {
                    const status = displayStatus(i, now);
                    return (
                      <tr key={i.id} className="cursor-pointer border-t border-border hover:bg-accent/40" onClick={() => setSheet({ kind: 'invoice', invoice: i })}>
                        <td className="py-1.5">{i.number ?? 'Draft'}</td>
                        <td>{customerName(i.customerId)}</td>
                        <td>{i.issueDate ?? '—'}</td>
                        <td>{i.dueDate ?? '—'}</td>
                        <td className="text-right">{money(totals(i).totalMinor)}</td>
                        <td className="pl-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[status]}`}>{status === 'void' ? 'VOID' : status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">No customers yet</p>
            <p className="text-xs text-muted-foreground">Add who you bill; their name and address print on the invoice.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {customers.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSheet({ kind: 'customer', customer: c })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60">
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.email ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sheet?.kind === 'invoice' ? <InvoiceSheet key={sheet.invoice?.id ?? 'new'} invoice={sheet.invoice} customers={customers} company={company} bookName={bookName} today={now} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'customer' ? <CustomerSheet key={sheet.customer?.id ?? 'new'} customer={sheet.customer} onClose={() => setSheet(null)} /> : null}
    </main>
  );
}
