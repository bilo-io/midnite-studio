import { addDays, totals, type Invoice, type JournalLine, type LedgerPostRequest, type LedgerResult, type StartupResult, type StartupSnapshot, type StartupWorkspace } from '@midnite/studio-shared';

import type { StartupLedgerPort } from './ledger-port';
import type { Mutation, WorkspaceStore } from './workspace-store';

type Failure = Extract<StartupResult<never>, { ok: false }>;
const refuse = (kind: Failure['kind'], message: string): Failure => ({ ok: false, kind, message });
const NO_BOOK = 'Link a book in Settings ▸ Company to issue invoices.';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A ledger refusal as Startup's own: the invoice stays as it was and the book's message says why. */
const fromLedger = (r: Extract<LedgerResult<unknown>, { ok: false }>): Failure =>
  refuse('ledger', r.kind === 'locked-period' ? `The books are locked for that date. ${r.message}` : r.message);

/**
 * Posting is the commit point (Phase 130 Decision): the workspace is written only after the ledger answers `ok`,
 * and the ledger is idempotent on `source.ref` (the invoice id), so a crash between the two is healed by a retry.
 * Two transitions at once would both read the same counter, so every transition runs one at a time per store.
 */
const chains = new WeakMap<WorkspaceStore, Promise<unknown>>();
function serially<T>(store: WorkspaceStore, run: () => Promise<T>): Promise<T> {
  const next = (chains.get(store) ?? Promise.resolve()).then(run, run);
  chains.set(store, next.catch(() => undefined));
  return next;
}

export type InvoiceDeps = { ledger: StartupLedgerPort | null; now?: () => Date };

type Ready = { ws: StartupWorkspace; invoice: Invoice; port: StartupLedgerPort; link: NonNullable<StartupWorkspace['ledger']> };

function ready(store: WorkspaceStore, id: string, deps: InvoiceDeps): Ready | Failure {
  const ws = store.snapshot().workspace;
  const invoice = ws.invoices.find((i) => i.id === id);
  if (invoice === undefined) return refuse('not-found', 'That invoice no longer exists.');
  if (deps.ledger === null || ws.ledger === null) return refuse('no-book', NO_BOOK);
  return { ws, invoice, port: deps.ledger, link: ws.ledger };
}

const memo = (invoice: Invoice, what: string): string => `${what} ${invoice.number ?? ''}`.trim();

function postRequest(bookId: string, date: string, description: string, lines: JournalLine[], kind: 'invoice' | 'payment', ref: string): LedgerPostRequest {
  return { bookId, entry: { date, description, lines, source: { app: 'startup', kind, ref } } };
}

/** draft → issued: assigns the next gapless number, then posts Dr receivable total / Cr sales net / Cr tax payable tax. */
export function issueInvoice(store: WorkspaceStore, id: string, issueDate: string, deps: InvoiceDeps): Promise<StartupResult<StartupSnapshot>> {
  return serially(store, async () => {
    const r = ready(store, id, deps);
    if ('ok' in r) return r;
    const { ws, invoice, port, link } = r;
    if (invoice.status !== 'draft') return refuse('invalid', 'Only a draft can be issued.');
    if (ws.company === null) return refuse('invalid', 'Set up your company first.');
    if (!DATE.test(issueDate)) return refuse('invalid', 'Pick an issue date.');
    const customer = ws.customers.find((c) => c.id === invoice.customerId);
    if (customer === undefined) return refuse('not-found', 'That customer no longer exists.');
    const t = totals(invoice);
    if (t.totalMinor <= 0) return refuse('invalid', 'An invoice for nothing cannot be issued.');

    const counter = ws.invoiceCounter + 1;
    const number = `${ws.company.invoicePrefix}${String(counter).padStart(4, '0')}`;
    const dueDate = addDays(issueDate, ws.company.paymentTermsDays);
    const lines: JournalLine[] = [{ accountId: link.accounts.receivable, side: 'debit', minor: t.totalMinor, memo: number }];
    if (t.netMinor > 0) lines.push({ accountId: link.accounts.sales, side: 'credit', minor: t.netMinor, memo: number });
    if (t.taxMinor > 0) lines.push({ accountId: link.accounts.taxPayable, side: 'credit', minor: t.taxMinor, memo: number });
    const posted = await port.post(postRequest(link.bookId, issueDate, `Invoice ${number} · ${customer.name}`.slice(0, 200), lines, 'invoice', invoice.id), { kind: 'invoice', ref: invoice.id });
    if (!posted.ok) return fromLedger(posted);

    return store.mutate((current): Mutation => {
      const now = current.invoices.find((i) => i.id === id);
      if (now === undefined || now.status !== 'draft' || current.invoiceCounter !== ws.invoiceCounter) return refuse('invalid', 'The invoice changed while it was being issued. Try again.');
      const issued: Invoice = { ...now, number, issueDate, dueDate, status: 'issued', entries: { ...now.entries, issued: posted.value.entryId } };
      return { ok: true, workspace: { ...current, invoiceCounter: counter, invoices: current.invoices.map((i) => (i.id === id ? issued : i)) } };
    });
  });
}

/** issued → paid: Dr bank / Cr receivable for the total. */
export function markPaid(store: WorkspaceStore, id: string, paidDate: string, deps: InvoiceDeps): Promise<StartupResult<StartupSnapshot>> {
  return serially(store, async () => {
    const r = ready(store, id, deps);
    if ('ok' in r) return r;
    const { invoice, port, link } = r;
    if (invoice.status !== 'issued') return refuse('invalid', 'Only an issued invoice can be marked paid.');
    if (!DATE.test(paidDate)) return refuse('invalid', 'Pick the date it was paid.');
    if (invoice.issueDate !== null && paidDate < invoice.issueDate) return refuse('invalid', 'It cannot be paid before it was issued.');
    const { totalMinor } = totals(invoice);
    const lines: JournalLine[] = [
      { accountId: link.accounts.bank, side: 'debit', minor: totalMinor, memo: invoice.number ?? undefined },
      { accountId: link.accounts.receivable, side: 'credit', minor: totalMinor, memo: invoice.number ?? undefined },
    ];
    const posted = await port.post(postRequest(link.bookId, paidDate, memo(invoice, 'Payment for invoice'), lines, 'payment', invoice.id), { kind: 'payment', ref: invoice.id });
    if (!posted.ok) return fromLedger(posted);
    return store.mutate((current): Mutation => {
      const now = current.invoices.find((i) => i.id === id);
      if (now === undefined || now.status !== 'issued') return refuse('invalid', 'The invoice changed while it was being paid. Try again.');
      const paid: Invoice = { ...now, status: 'paid', paidDate, entries: { ...now.entries, paid: posted.value.entryId } };
      return { ok: true, workspace: { ...current, invoices: current.invoices.map((i) => (i.id === id ? paid : i)) } };
    });
  });
}

/** issued → void: reverses the issue entry. The number stays used; a paid invoice cannot be voided. */
export function voidInvoice(store: WorkspaceStore, id: string, reason: string, deps: InvoiceDeps): Promise<StartupResult<StartupSnapshot>> {
  return serially(store, async () => {
    const r = ready(store, id, deps);
    if ('ok' in r) return r;
    const { invoice, port, link } = r;
    if (invoice.status === 'paid') return refuse('invalid', 'Refunds are not supported yet.');
    if (invoice.status !== 'issued') return refuse('invalid', 'Only an issued invoice can be voided.');
    if (reason.trim() === '') return refuse('invalid', 'Give a reason for voiding it.');
    const issuedEntry = invoice.entries.issued;
    if (issuedEntry === undefined) return refuse('invalid', 'This invoice has no journal entry to reverse.');
    const date = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const reversed = await port.reverse(link.bookId, issuedEntry, date, `Void ${invoice.number ?? 'invoice'}: ${reason.trim()}`.slice(0, 200));
    if (!reversed.ok) return fromLedger(reversed);
    return store.mutate((current): Mutation => {
      const now = current.invoices.find((i) => i.id === id);
      if (now === undefined || now.status !== 'issued') return refuse('invalid', 'The invoice changed while it was being voided. Try again.');
      const voided: Invoice = { ...now, status: 'void', voidReason: reason.trim(), entries: { ...now.entries, void: reversed.value.entryId } };
      return { ok: true, workspace: { ...current, invoices: current.invoices.map((i) => (i.id === id ? voided : i)) } };
    });
  });
}
