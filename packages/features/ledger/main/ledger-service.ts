import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CurrencyCodeSchema,
  EVENT_CHANNELS,
  LedgerAccountSchema,
  type JournalEntry,
  type JournalSource,
  type LedgerAccount,
  type LedgerAccountInput,
  type LedgerBook,
  type LedgerBookSummary,
  type LedgerEntity,
  type LedgerErrorKind,
  type LedgerPostRequest,
  type LedgerResult,
  type SuiteAppId,
  type TaxJurisdictionId,
} from '@midnite/studio-shared';

import { CorruptBookError, openBookStore, type BookStore } from './book-store';
import { CHART_TEMPLATES } from './chart-templates';

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

export type LedgerServiceOptions = {
  /** `join(runtimeDataDirectory(appDataBase), 'books')`; one folder per book, named by its uuid. */
  root: string;
  appId: SuiteAppId;
  now?: () => Date;
  warn?: (message: string) => void;
  /** Fires after every write: `(EVENT_CHANNELS.ledgerChanged, { bookId, revision })`. */
  send?: (channel: string, payload: unknown) => void;
};

const fail = (kind: LedgerErrorKind, message: string): { ok: false; kind: LedgerErrorKind; message: string } => ({ ok: false, kind, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The real service over on-disk books. Stores open lazily on first use and stay open until `dispose()`. */
export function createLedgerService(opts: LedgerServiceOptions): LedgerService {
  const { root, appId } = opts;
  const now = opts.now ?? ((): Date => new Date());
  const stores = new Map<string, Promise<BookStore>>();
  /** Books whose `book.json` was unreadable: id → where the bad file went (or the folder). */
  const corruptBooks = new Map<string, string>();

  const dirOf = (bookId: string): string => join(root, bookId);

  async function storeFor(bookId: string): Promise<BookStore | LedgerResult<never>> {
    if (!UUID.test(bookId)) return fail('not-found', 'That book does not exist.');
    if (corruptBooks.has(bookId)) return fail('corrupt', `This book's book.json is unreadable: ${corruptBooks.get(bookId)}`);
    let pending = stores.get(bookId);
    if (!pending) {
      pending = openBookStore({ dir: dirOf(bookId), appId, now, warn: opts.warn });
      stores.set(bookId, pending);
    }
    try {
      const store = await pending;
      await store.refresh();
      return store;
    } catch (err) {
      stores.delete(bookId);
      if (err instanceof CorruptBookError) {
        // No book.json at all: a folder holding only an earlier `book.corrupt-*` is still a (corrupt) book.
        const earlier = err.movedTo ?? (await readdir(err.dir)).find((f) => f.startsWith('book.corrupt-'));
        if (!earlier) return fail('not-found', 'That book does not exist.');
        const movedTo = earlier.includes('/') ? earlier : join(err.dir, earlier);
        corruptBooks.set(bookId, movedTo);
        return fail('corrupt', `This book's book.json is unreadable and was moved to ${movedTo}.`);
      }
      throw err;
    }
  }

  const isResult = (v: BookStore | LedgerResult<never>): v is LedgerResult<never> => 'ok' in v;

  /** Runs `fn` on the book's store; every failure becomes the envelope. `changed` announces a write. */
  async function withStore<T>(bookId: string, fn: (store: BookStore) => Promise<LedgerResult<T>>, changed = false): Promise<LedgerResult<T>> {
    try {
      const store = await storeFor(bookId);
      if (isResult(store)) return store;
      const before = store.revision;
      const result = await fn(store);
      if (changed && result.ok) opts.send?.(EVENT_CHANNELS.ledgerChanged, { bookId, revision: Math.max(store.revision, before) });
      return result;
    } catch (err) {
      return fail('io', err instanceof Error ? err.message : 'ledger request failed');
    }
  }

  const summary = (store: BookStore): LedgerBookSummary => {
    const b = store.book();
    return {
      id: b.id,
      name: b.name,
      entity: b.entity,
      currency: b.currency,
      readOnly: store.readOnly,
      revision: store.revision,
      ...(store.corrupt ? { corrupt: { lines: store.corrupt.lines, path: store.dir } } : {}),
    };
  };

  const balanceOf = (store: BookStore, accountId: string): number => {
    const b = store.balances().get(accountId);
    return b ? b.debit - b.credit : 0;
  };

  const service: LedgerService = {
    async listBooks() {
      try {
        let names: string[] = [];
        try {
          names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && UUID.test(d.name)).map((d) => d.name);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        const books: LedgerBookSummary[] = [];
        for (const id of names) {
          const store = await storeFor(id);
          if (isResult(store)) {
            if (!store.ok && store.kind === 'corrupt') {
              books.push({ id, name: 'Unreadable book', entity: 'personal', currency: 'USD', readOnly: true, revision: 0, corrupt: { lines: [], path: dirOf(id) } });
            }
            continue;
          }
          books.push(summary(store));
        }
        books.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        return { ok: true, value: { books } };
      } catch (err) {
        return fail('io', err instanceof Error ? err.message : 'could not list books');
      }
    },

    async createBook(input) {
      try {
        const currency = CurrencyCodeSchema.safeParse(input.currency);
        if (!currency.success) return fail('invalid', 'Unknown currency code.');
        const id = randomUUID();
        const accounts: LedgerAccount[] = CHART_TEMPLATES[input.template].map((a) => ({ ...LedgerAccountSchema.parse({ ...a, id: randomUUID() }) }));
        const book: LedgerBook = {
          version: 1,
          id,
          name: input.name.trim(),
          entity: input.entity,
          currency: currency.data,
          fiscalYearStart: input.fiscalYearStart,
          lockedThrough: null,
          jurisdiction: null,
          accounts,
          rules: [],
          createdAt: now().toISOString(),
        };
        await mkdir(dirOf(id), { recursive: true });
        await writeFile(join(dirOf(id), 'book.json'), `${JSON.stringify(book, null, 2)}\n`);
        return withStore(id, async (store) => ({ ok: true, value: { book: store.book() } }), true);
      } catch (err) {
        return fail('io', err instanceof Error ? err.message : 'could not create the book');
      }
    },

    updateBook: (bookId, patch) =>
      withStore(
        bookId,
        async (store) => {
          const r = await store.updateBook((b) => ({
            ...b,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.lockedThrough !== undefined ? { lockedThrough: patch.lockedThrough } : {}),
            ...(patch.jurisdiction !== undefined ? { jurisdiction: patch.jurisdiction } : {}),
          }));
          return r.ok ? { ok: true, value: { book: r.value } } : r;
        },
        true,
      ),

    upsertAccount: (bookId, account) =>
      withStore(
        bookId,
        async (store) => {
          let saved: LedgerAccount | null = null;
          const r = await store.updateBook((b) => {
            const existing = account.id ? b.accounts.find((a) => a.id === account.id) : undefined;
            if (account.id && !existing) return 'That account does not exist.';
            if (b.accounts.some((a) => a.code === account.code && a.id !== account.id)) return `Account code ${account.code} is already in use.`;
            const next: LedgerAccount = { ...account, id: account.id ?? randomUUID(), archived: account.archived ?? false, taxTreatment: account.taxTreatment ?? 'none' };
            if (existing) {
              const used = store.balances().has(existing.id);
              if (used && existing.type !== next.type) return 'An account that has entries cannot change type.';
              if (next.archived && !existing.archived && balanceOf(store, existing.id) !== 0) return 'An account with a balance cannot be archived.';
            } else if (next.archived) {
              return 'A new account cannot start archived.';
            }
            saved = next;
            return { ...b, accounts: existing ? b.accounts.map((a) => (a.id === next.id ? next : a)) : [...b.accounts, next] };
          });
          return r.ok && saved ? { ok: true, value: { account: saved } } : r.ok ? fail('invalid', 'account not saved') : r;
        },
        true,
      ),

    archiveAccount: (bookId, accountId) =>
      withStore(
        bookId,
        async (store) => {
          const found = store.book().accounts.find((a) => a.id === accountId);
          if (!found) return fail('not-found', 'That account does not exist.');
          const r = await store.updateBook((b) => {
            if (balanceOf(store, accountId) !== 0) return 'An account with a balance cannot be archived.';
            return { ...b, accounts: b.accounts.map((a) => (a.id === accountId ? { ...a, archived: true } : a)) };
          });
          return r.ok ? { ok: true, value: { account: r.value.accounts.find((a) => a.id === accountId) as LedgerAccount } } : r;
        },
        true,
      ),

    post: (req, source) => withStore(req.bookId, (store) => store.post(req.entry, source), true),

    reverse: (bookId, entryId, date, reason) => withStore(bookId, (store) => store.reverse(entryId, date, reason), true),

    journal: (q) =>
      withStore(q.bookId, async (store) => {
        const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
        const text = q.query?.trim().toLowerCase();
        const all = store.entries();
        const start = q.cursor === undefined ? all.length : Number.parseInt(q.cursor, 10);
        if (!Number.isInteger(start) || start < 0 || start > all.length) return fail('invalid', 'Bad journal cursor.');
        const out: JournalEntry[] = [];
        let next: string | null = null;
        for (let i = start - 1; i >= 0; i -= 1) {
          const e = all[i] as JournalEntry;
          if (q.from && e.date < q.from) continue;
          if (q.to && e.date > q.to) continue;
          if (q.accountId && !e.lines.some((l) => l.accountId === q.accountId)) continue;
          if (text && !e.description.toLowerCase().includes(text)) continue;
          if (out.length === limit) {
            next = String(i + 1);
            break;
          }
          out.push(e);
        }
        return { ok: true, value: { entries: out, nextCursor: next } };
      }),

    balances: (bookId, asOf) =>
      withStore(bookId, async (store) => {
        const totals = new Map<string, { debit: number; credit: number }>();
        for (const e of store.entries()) {
          if (e.date > asOf) continue;
          for (const l of e.lines) {
            const t = totals.get(l.accountId) ?? { debit: 0, credit: 0 };
            if (l.side === 'debit') t.debit += l.minor;
            else t.credit += l.minor;
            totals.set(l.accountId, t);
          }
        }
        return { ok: true, value: { balances: [...totals].map(([accountId, t]) => ({ accountId, ...t })) } };
      }),

    async dispose() {
      const pending = [...stores.values()];
      stores.clear();
      await Promise.all(pending.map((p) => p.then((s) => s.dispose(), () => undefined)));
    },
  };
  return service;
}
