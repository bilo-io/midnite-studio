import type { LedgerPostRequest, LedgerResult } from '@midnite/studio-shared';

/** What an invoice's journal entry points back at; the host stamps `app: 'startup'` on top, never the module. */
export type StartupPostSource = { kind: 'invoice' | 'payment'; ref: string };

/** One account of a book, as far as Startup needs: its code to order by, its subtype to find the four it posts to. */
export type StartupBookAccount = { id: string; code: string; type: string; subtype: string; archived: boolean };

/**
 * The books as Startup sees them. Startup declares this port and its host implements it over the ledger
 * service, so the module imports types from `shared` only: it never reaches the ledger feature or the
 * Accountant module (a module never imports another module). Every method answers a `LedgerResult`, never throws.
 */
export type StartupLedgerPort = {
  listBooks(): Promise<LedgerResult<{ id: string; name: string; entity: string; currency: string; readOnly: boolean }[]>>;
  /** A book's whole chart, for resolving the four accounts at link time. */
  accounts(bookId: string): Promise<LedgerResult<{ name: string; accounts: StartupBookAccount[] }>>;
  /** Idempotent on `source.ref`: a retry answers `duplicate: true` with the first entry's id. */
  post(req: LedgerPostRequest, source: StartupPostSource): Promise<LedgerResult<{ entryId: string; duplicate: boolean }>>;
  reverse(bookId: string, entryId: string, date: string, reason: string): Promise<LedgerResult<{ entryId: string }>>;
  /** Cash plus bank balances as of a date, in minor units. */
  cashBalance(bookId: string, asOf: string): Promise<LedgerResult<{ minor: number }>>;
  /** Income and expense per calendar month (`YYYY-MM`) between two dates, months with no entries included as zero. */
  monthlyNet(bookId: string, from: string, to: string): Promise<LedgerResult<{ month: string; incomeMinor: number; expenseMinor: number }[]>>;
};
