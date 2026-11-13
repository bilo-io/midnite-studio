import type { StartupLedgerSummary, StartupResult, StartupSnapshot, StartupWorkspace } from '@midnite/studio-shared';

import type { StartupLedgerPort } from './ledger-port';
import type { Mutation, WorkspaceStore } from './workspace-store';

type Failure = Extract<StartupResult<never>, { ok: false }>;
const refuse = (kind: Failure['kind'], message: string): Failure => ({ ok: false, kind, message });

/** The four accounts invoices post to, by subtype. */
const WANTED = [
  ['receivable', 'receivable'],
  ['sales', 'sales'],
  ['tax-payable', 'taxPayable'],
  ['bank', 'bank'],
] as const;

/**
 * Links (or unlinks) the book invoices post into. The book must be in the company's currency, and every one of
 * the four accounts is resolved now — the first non-archived of each subtype, by code — so a missing one is
 * refused here rather than halfway through issuing an invoice. Once an invoice is posted the link is fixed:
 * voiding and reversing need the very book that holds the entry.
 */
export async function linkBook(store: WorkspaceStore, bookId: string | null, ledger: StartupLedgerPort | null): Promise<StartupResult<StartupSnapshot>> {
  const ws = store.snapshot().workspace;
  const posted = ws.invoices.some((i) => i.status !== 'draft');
  if (bookId === null) {
    if (posted) return refuse('locked', 'Invoices are already posted to the linked book, so it cannot be unlinked.');
    return store.mutate((current): Mutation => ({ ok: true, workspace: { ...current, ledger: null } }));
  }
  if (ledger === null) return refuse('no-book', 'The books are not available in this build.');
  if (ws.company === null) return refuse('invalid', 'Set up your company first.');
  if (posted && ws.ledger !== null && ws.ledger.bookId !== bookId) return refuse('locked', 'Invoices are already posted to the linked book, so it cannot be changed.');
  const books = await ledger.listBooks();
  if (!books.ok) return refuse('ledger', books.message);
  const book = books.value.find((b) => b.id === bookId);
  if (book === undefined) return refuse('not-found', 'That book no longer exists.');
  if (book.currency !== ws.company.currency) return refuse('ledger', `${book.name} is in ${book.currency}, and the company's currency is ${ws.company.currency}.`);
  const chart = await ledger.accounts(bookId);
  if (!chart.ok) return refuse('ledger', chart.message);
  const found = {} as Record<'receivable' | 'sales' | 'taxPayable' | 'bank', string>;
  for (const [subtype, key] of WANTED) {
    const account = chart.value.accounts
      .filter((a) => a.subtype === subtype && !a.archived)
      .sort((a, b) => a.code.localeCompare(b.code))[0];
    if (account === undefined) return refuse('ledger', `${book.name} has no ${subtype} account.`);
    found[key] = account.id;
  }
  const link: NonNullable<StartupWorkspace['ledger']> = { bookId, accounts: found };
  return store.mutate((current): Mutation => ({ ok: true, workspace: { ...current, ledger: link } }));
}

const monthOf = (date: Date, offset: number): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
};
const lastDayOf = (month: string): string => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The linked book's cash today and its actual burn over the last three full months. */
export async function ledgerSummary(store: WorkspaceStore, ledger: StartupLedgerPort | null, now: Date): Promise<StartupResult<StartupLedgerSummary>> {
  const ws = store.snapshot().workspace;
  if (ledger === null || ws.ledger === null) return refuse('no-book', 'Link a book in Settings ▸ Company to use actuals.');
  const { bookId } = ws.ledger;
  const today = now.toISOString().slice(0, 10);
  const chart = await ledger.accounts(bookId);
  if (!chart.ok) return refuse('ledger', chart.message);
  const cash = await ledger.cashBalance(bookId, today);
  if (!cash.ok) return refuse('ledger', cash.message);
  const first = monthOf(now, -3);
  const net = await ledger.monthlyNet(bookId, `${first}-01`, lastDayOf(monthOf(now, -1)));
  let actualBurnMinor: number | null = null;
  if (net.ok) {
    const sum = net.value.reduce((total, m) => total + (m.expenseMinor - m.incomeMinor), 0);
    actualBurnMinor = Math.sign(sum) * Math.floor((Math.abs(sum) * 2 + 3) / 6);
  }
  return { ok: true, value: { bookName: chart.value.name, cashMinor: cash.value.minor, asOf: today, actualBurnMinor } };
}
