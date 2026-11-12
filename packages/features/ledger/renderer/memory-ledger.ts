import { buildReport, buildTaxEstimate, parseAmount, ReportRangeError } from '@midnite/studio-shared';
import type {
  ImportPreviewRow,
  JournalEntry,
  LedgerAccount,
  LedgerBook,
  LedgerBookDetail,
  LedgerBridge,
  LedgerEntity,
  TaxJurisdictionId,
  LedgerErrorKind,
  LedgerResult,
  ImportMapping,
} from '@midnite/studio-shared';

export type MemoryLedgerOptions = {
  /** Seed one sole-trader book with a few entries (default true). */
  seed?: boolean;
  /** Present the seeded book as read-only, held by this app. */
  readOnlyBy?: string;
  /** Present the seeded book as corrupt at these journal lines. */
  corruptLines?: number[];
  /** Today, for the seeded entries' dates (default 2026-05-20). */
  today?: string;
  /** The seeded book's entity (default sole-trader). */
  entity?: LedgerEntity;
  /** The seeded book's tax jurisdiction (default none). */
  jurisdiction?: TaxJurisdictionId | null;
};

export const SEED_BOOK_ID = '11111111-1111-4111-8111-111111111111';
const acc = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fail = (kind: LedgerErrorKind, message: string): { ok: false; kind: LedgerErrorKind; message: string } => ({ ok: false, kind, message });
const ok = <T>(value: T): LedgerResult<T> => ({ ok: true, value });

const SEED_ACCOUNTS: Omit<LedgerAccount, 'id'>[] = [
  { code: '1000', name: 'Bank', type: 'asset', subtype: 'bank', archived: false, taxTreatment: 'none' },
  { code: '1100', name: 'Accounts receivable', type: 'asset', subtype: 'receivable', archived: false, taxTreatment: 'none' },
  { code: '2000', name: 'Accounts payable', type: 'liability', subtype: 'payable', archived: false, taxTreatment: 'none' },
  { code: '3000', name: "Owner's capital", type: 'equity', subtype: 'owner-equity', archived: false, taxTreatment: 'none' },
  { code: '4000', name: 'Sales', type: 'income', subtype: 'sales', archived: false, taxTreatment: 'none' },
  { code: '6000', name: 'Software & subscriptions', type: 'expense', subtype: 'operating-expense', archived: false, taxTreatment: 'allowable' },
];

/** The one statement `importPick` offers: a header and signed amounts, ISO dates. */
const STATEMENT: string[][] = [
  ['Date', 'Description', 'Amount'],
  ['2026-05-15', 'ADOBE *CREATIVE CLOUD', '-19.99'],
  ['2026-05-16', 'Client payment — Globex', '1500.00'],
  ['2026-05-17', 'TRAINLINE LONDON', '-42.10'],
  ['2026-05-18', 'Mystery transfer', '-7.00'],
];

function readStatement(book: LedgerBook, mapping: ImportMapping, imported: ReadonlySet<string>): ImportPreviewRow[] {
  return STATEMENT.slice(1).map((cells, index): ImportPreviewRow => {
    const description = cells[mapping.description] ?? '';
    const date = cells[mapping.date.column] ?? '';
    const base = { index, date, description, suggestedAccountId: null, duplicate: imported.has(`${mapping.token}:${index}`) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ...base, minor: 0, error: `Date "${date}" is not ${mapping.date.format}.` };
    const column = mapping.amount.kind === 'single' ? mapping.amount.column : mapping.amount.inColumn;
    const amount = parseAmount(cells[column] ?? '', book.currency);
    if (!amount.ok) return { ...base, minor: 0, error: 'The amount is not a number.' };
    const minor = mapping.amount.kind === 'single' && !mapping.amount.negativeIsOutflow ? -amount.minor : amount.minor;
    const rule = [...book.rules].sort((a, b) => a.priority - b.priority).find((r) => description.toLowerCase().includes(r.match.contains.toLowerCase()));
    return { ...base, minor, suggestedAccountId: rule?.accountId ?? null };
  });
}

/**
 * The books bridge in memory — one seeded book and the ops the Overview, Accounts and Journal views use.
 * It enforces the same posting rules main does (balanced, archived account, locked period) so a view's error
 * states can be driven through it. Used by the app's mock bridge, the shots spec and this feature's tests;
 * tax and reports run the real report maths over the in-memory journal; import reads one built-in statement.
 */
export function createMemoryLedger(options: MemoryLedgerOptions = {}): LedgerBridge & { entries: () => JournalEntry[] } {
  const today = options.today ?? '2026-05-20';
  const books = new Map<string, LedgerBook>();
  const journals = new Map<string, JournalEntry[]>();
  const listeners = new Set<(e: { bookId: string; revision: number }) => void>();
  let seq = 100;
  const id = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const announce = (bookId: string): void => listeners.forEach((l) => l({ bookId, revision: journals.get(bookId)?.length ?? 0 }));

  /** A two-line seed entry between account numbers (1-based indexes into the seeded chart). */
  const entry = (date: string, description: string, debit: number, credit: number, minor: number): JournalEntry => ({
    id: id(),
    date,
    description,
    lines: [
      { accountId: acc(debit), side: 'debit', minor },
      { accountId: acc(credit), side: 'credit', minor },
    ],
    source: { app: 'money', kind: 'manual' },
    postedAt: `${date}T09:00:00.000Z`,
  });

  if (options.seed !== false) {
    books.set(SEED_BOOK_ID, {
      version: 1,
      id: SEED_BOOK_ID,
      name: 'Acme Studio',
      entity: options.entity ?? 'sole-trader',
      currency: 'GBP',
      fiscalYearStart: { month: 4, day: 6 },
      lockedThrough: null,
      jurisdiction: options.jurisdiction ?? null,
      accounts: SEED_ACCOUNTS.map((a, i) => ({ ...a, id: acc(i + 1) })),
      rules: [{ id: acc(900), match: { field: 'description', contains: 'adobe' }, accountId: acc(6), priority: 0 }],
      createdAt: '2026-04-06T00:00:00.000Z',
    });
    journals.set(SEED_BOOK_ID, [
      entry('2026-04-10', 'Owner capital in', 1, 4, 500_000),
      entry('2026-04-22', 'Invoice 0001 — Globex', 2, 5, 120_000),
      entry('2026-05-02', 'Invoice 0001 paid', 1, 2, 120_000),
      entry('2026-05-14', 'Figma subscription', 6, 1, 4_500),
    ]);
  }

  const readOnly = (bookId: string): boolean => bookId === SEED_BOOK_ID && options.readOnlyBy !== undefined;
  const find = (bookId: string): LedgerBook | null => books.get(bookId) ?? null;
  const notFound = fail('not-found', 'That book does not exist.');

  const balanceOf = (bookId: string, accountId: string): number =>
    (journals.get(bookId) ?? []).reduce((t, e) => t + e.lines.reduce((s, l) => (l.accountId === accountId ? s + (l.side === 'debit' ? l.minor : -l.minor) : s), 0), 0);

  /** Statement rows already posted by `importCommit`, per book. The mock has one statement, so a row's reference is its index. */
  const importedRefs = new Map<string, Set<string>>();


  const post = (bookId: string, input: Omit<JournalEntry, 'id' | 'postedAt'>): LedgerResult<{ entry: JournalEntry; duplicate: boolean }> => {
    const book = find(bookId);
    if (!book) return notFound;
    if (readOnly(bookId)) return fail('read-only', `Open in ${options.readOnlyBy} — this book is being written there.`);
    const sum = (side: 'debit' | 'credit'): number => input.lines.reduce((t, l) => (l.side === side ? t + l.minor : t), 0);
    if (sum('debit') !== sum('credit')) return fail('unbalanced', 'Debits and credits must be equal.');
    for (const l of input.lines) {
      const a = book.accounts.find((x) => x.id === l.accountId);
      if (!a) return fail('not-found', 'An account on this entry does not exist.');
      if (a.archived) return fail('archived-account', `Account ${a.code} ${a.name} is archived.`);
    }
    if (book.lockedThrough !== null && input.date <= book.lockedThrough) return fail('locked-period', `Books are locked through ${book.lockedThrough}.`);
    const created: JournalEntry = { ...input, id: id(), postedAt: `${today}T12:00:00.000Z` };
    journals.get(bookId)?.push(created);
    announce(bookId);
    return ok({ entry: created, duplicate: false });
  };

  return {
    entries: () => [...journals.values()].flat(),
    listBooks: async () =>
      ok({
        books: [...books.values()].map((b) => ({
          id: b.id,
          name: b.name,
          entity: b.entity,
          currency: b.currency,
          readOnly: readOnly(b.id),
          revision: journals.get(b.id)?.length ?? 0,
          ...(b.id === SEED_BOOK_ID && options.corruptLines ? { corrupt: { lines: options.corruptLines, path: '/books/acme' } } : {}),
        })),
      }),
    getBook: async ({ bookId }) => {
      const book = find(bookId);
      if (!book) return notFound;
      const detail: LedgerBookDetail = {
        book,
        readOnly: readOnly(bookId) || (bookId === SEED_BOOK_ID && options.corruptLines !== undefined),
        lockedBy: readOnly(bookId) ? (options.readOnlyBy as string) : null,
        revision: journals.get(bookId)?.length ?? 0,
        ...(bookId === SEED_BOOK_ID && options.corruptLines ? { corrupt: { lines: options.corruptLines, path: '/books/acme' } } : {}),
      };
      return ok(detail);
    },
    createBook: async (req) => {
      const bookId = id();
      const book: LedgerBook = {
        version: 1,
        id: bookId,
        name: req.name,
        entity: req.entity,
        currency: req.currency,
        fiscalYearStart: req.fiscalYearStart,
        lockedThrough: null,
        jurisdiction: null,
        accounts: SEED_ACCOUNTS.map((a) => ({ ...a, id: id() })),
        rules: [],
        createdAt: `${today}T00:00:00.000Z`,
      };
      books.set(bookId, book);
      journals.set(bookId, []);
      announce(bookId);
      return ok({ book });
    },
    updateBook: async ({ bookId, patch }) => {
      const book = find(bookId);
      if (!book) return notFound;
      if (readOnly(bookId)) return fail('read-only', `Open in ${options.readOnlyBy} — this book is being written there.`);
      const next: LedgerBook = {
        ...book,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.lockedThrough !== undefined ? { lockedThrough: patch.lockedThrough } : {}),
        ...(patch.jurisdiction !== undefined ? { jurisdiction: patch.jurisdiction } : {}),
      };
      books.set(bookId, next);
      announce(bookId);
      return ok({ book: next });
    },
    upsertAccount: async ({ bookId, account }) => {
      const book = find(bookId);
      if (!book) return notFound;
      if (readOnly(bookId)) return fail('read-only', `Open in ${options.readOnlyBy} — this book is being written there.`);
      if (book.accounts.some((a) => a.code === account.code && a.id !== account.id)) return fail('invalid', `Account code ${account.code} is already in use.`);
      const saved: LedgerAccount = { ...account, id: account.id ?? id(), archived: account.archived ?? false, taxTreatment: account.taxTreatment ?? 'none' };
      books.set(bookId, { ...book, accounts: account.id ? book.accounts.map((a) => (a.id === saved.id ? saved : a)) : [...book.accounts, saved] });
      announce(bookId);
      return ok({ account: saved });
    },
    archiveAccount: async ({ bookId, accountId }) => {
      const book = find(bookId);
      if (!book) return notFound;
      const found = book.accounts.find((a) => a.id === accountId);
      if (!found) return fail('not-found', 'That account does not exist.');
      if (balanceOf(bookId, accountId) !== 0) return fail('invalid', 'An account with a balance cannot be archived.');
      const archived = { ...found, archived: true };
      books.set(bookId, { ...book, accounts: book.accounts.map((a) => (a.id === accountId ? archived : a)) });
      announce(bookId);
      return ok({ account: archived });
    },
    post: async ({ bookId, entry: input }) => {
      const r = post(bookId, input);
      return r.ok ? ok({ entry: r.value.entry }) : r;
    },
    reverse: async ({ bookId, entryId, date, reason }) => {
      const original = journals.get(bookId)?.find((e) => e.id === entryId);
      if (!original) return fail('not-found', 'That entry does not exist.');
      const existing = journals.get(bookId)?.find((e) => e.reverses === entryId);
      if (existing) return ok({ entry: existing });
      const r = post(bookId, {
        date,
        description: `Reversal: ${original.description} — ${reason}`.slice(0, 200),
        lines: original.lines.map((l) => ({ ...l, side: l.side === 'debit' ? 'credit' : 'debit' })),
        source: { app: 'money', kind: 'reversal', ref: entryId },
        reverses: entryId,
      });
      return r.ok ? ok({ entry: r.value.entry }) : r;
    },
    journal: async ({ bookId, accountId, query, cursor, limit, from, to }) => {
      if (!find(bookId)) return notFound;
      const all = journals.get(bookId) ?? [];
      const start = cursor === undefined ? all.length : Number.parseInt(cursor, 10);
      const out: JournalEntry[] = [];
      let next: string | null = null;
      for (let i = start - 1; i >= 0; i -= 1) {
        const e = all[i] as JournalEntry;
        if (from && e.date < from) continue;
        if (to && e.date > to) continue;
        if (accountId && !e.lines.some((l) => l.accountId === accountId)) continue;
        if (query && !e.description.toLowerCase().includes(query.toLowerCase())) continue;
        if (out.length === (limit ?? 100)) {
          next = String(i + 1);
          break;
        }
        out.push(e);
      }
      return ok({ entries: out, nextCursor: next });
    },
    balances: async ({ bookId, asOf }) => {
      if (!find(bookId)) return notFound;
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const e of journals.get(bookId) ?? []) {
        if (e.date > asOf) continue;
        for (const l of e.lines) {
          const t = totals.get(l.accountId) ?? { debit: 0, credit: 0 };
          if (l.side === 'debit') t.debit += l.minor;
          else t.credit += l.minor;
          totals.set(l.accountId, t);
        }
      }
      return ok({ balances: [...totals].map(([accountId, t]) => ({ accountId, ...t })) });
    },
    report: async ({ bookId, kind, from, to }) => {
      const book = find(bookId);
      if (!book) return notFound;
      try {
        return ok(buildReport(kind, book, journals.get(bookId) ?? [], from, to));
      } catch (err) {
        if (err instanceof ReportRangeError) return fail('invalid', err.message);
        throw err;
      }
    },
    exportReport: async ({ bookId }) => (find(bookId) ? ok({ path: '/memory/report.csv' }) : notFound),
    importPick: async ({ bookId }) => {
      if (!find(bookId)) return notFound;
      return ok({ token: 'memory-statement', header: STATEMENT[0] as string[], sample: STATEMENT.slice(1, 11) });
    },
    importPreview: async ({ bookId, mapping }) => {
      const book = find(bookId);
      if (!book) return notFound;
      if (mapping.token !== 'memory-statement') return fail('invalid', 'That statement is no longer open. Choose the file again.');
      return ok({ rows: readStatement(book, mapping, importedRefs.get(bookId) ?? new Set()) });
    },
    importCommit: async ({ bookId, mapping, rows }) => {
      const book = find(bookId);
      if (!book) return notFound;
      if (readOnly(bookId)) return fail('read-only', `Open in ${options.readOnlyBy} — this book is being written there.`);
      const refs = importedRefs.get(bookId) ?? new Set<string>();
      importedRefs.set(bookId, refs);
      const byIndex = new Map(readStatement(book, mapping, refs).map((r) => [r.index, r]));
      const out = { posted: 0, duplicates: 0, failed: [] as { index: number; reason: string }[] };
      for (const pick of rows) {
        const row = byIndex.get(pick.index);
        if (!row || row.error) {
          out.failed.push({ index: pick.index, reason: row?.error ?? 'That row is not in the statement.' });
        } else if (row.duplicate) {
          out.duplicates += 1;
        } else {
          const abs = Math.abs(row.minor);
          const r = post(bookId, {
            date: row.date,
            description: row.description,
            lines: [
              { accountId: mapping.bankAccountId, side: row.minor > 0 ? 'debit' : 'credit', minor: abs },
              { accountId: pick.accountId, side: row.minor > 0 ? 'credit' : 'debit', minor: abs },
            ],
            source: { app: 'money', kind: 'import', ref: `${mapping.token}:${row.index}` },
          });
          if (r.ok) {
            out.posted += 1;
            refs.add(`${mapping.token}:${row.index}`);
          } else {
            out.failed.push({ index: pick.index, reason: r.message });
          }
        }
      }
      return ok(out);
    },
    taxEstimate: async ({ bookId, taxYear }) => {
      const book = find(bookId);
      return book ? buildTaxEstimate(book, journals.get(bookId) ?? [], taxYear) : notFound;
    },
    onChanged: (handler) => {
      listeners.add(handler);
      return () => void listeners.delete(handler);
    },
  };
}
