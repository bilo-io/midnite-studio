import type {
  JournalEntry,
  JournalSource,
  LedgerAccount,
  LedgerAccountInput,
  LedgerBook,
  LedgerBookSummary,
  LedgerEntity,
  LedgerPostRequest,
  LedgerResult,
  TaxJurisdictionId,
} from '@midnite/studio-shared';

/** What `createBook` takes (the request's fields, minus `op`). */
export type CreateBookInput = {
  name: string;
  entity: LedgerEntity;
  currency: string;
  fiscalYearStart: { month: number; day: number };
  template: LedgerEntity;
};

export type JournalQuery = { bookId: string; from?: string; to?: string; accountId?: string; query?: string; cursor?: string; limit?: number };

/**
 * The books service: every method answers a {@link LedgerResult}, never throws. A host keeps the one it
 * builds — Phase 130's Startup `LedgerPort` wraps `post` and `balances` over the same books.
 * `post` takes `source` from the caller in main; the renderer cannot choose it.
 */
export type LedgerService = {
  listBooks(): Promise<LedgerResult<{ books: LedgerBookSummary[] }>>;
  createBook(input: CreateBookInput): Promise<LedgerResult<{ book: LedgerBook }>>;
  updateBook(bookId: string, patch: { name?: string; lockedThrough?: string | null; jurisdiction?: TaxJurisdictionId | null }): Promise<LedgerResult<{ book: LedgerBook }>>;
  upsertAccount(bookId: string, account: LedgerAccountInput): Promise<LedgerResult<{ account: LedgerAccount }>>;
  archiveAccount(bookId: string, accountId: string): Promise<LedgerResult<{ account: LedgerAccount }>>;
  post(req: LedgerPostRequest, source: JournalSource): Promise<LedgerResult<{ entry: JournalEntry; duplicate: boolean }>>;
  reverse(bookId: string, entryId: string, date: string, reason: string): Promise<LedgerResult<{ entry: JournalEntry; duplicate: boolean }>>;
  journal(query: JournalQuery): Promise<LedgerResult<{ entries: JournalEntry[]; nextCursor: string | null }>>;
  balances(bookId: string, asOf: string): Promise<LedgerResult<{ balances: { accountId: string; debit: number; credit: number }[] }>>;
  /** Releases every book's writer lock. */
  dispose(): Promise<void>;
};

const UNAVAILABLE = 'Books are not available yet.';

/**
 * A service that answers every op `io` — the stand-in until the book store lands (Phase 129 Theme C), so a
 * host can mount the module and its channel without a store behind it.
 */
export function createUnavailableLedgerService(): LedgerService {
  const fail = async (): Promise<{ ok: false; kind: 'io'; message: string }> => ({ ok: false, kind: 'io', message: UNAVAILABLE });
  return {
    listBooks: fail,
    createBook: fail,
    updateBook: fail,
    upsertAccount: fail,
    archiveAccount: fail,
    post: fail,
    reverse: fail,
    journal: fail,
    balances: fail,
    dispose: async () => {},
  };
}
