import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, stat, truncate, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  JournalEntrySchema,
  LedgerBookSchema,
  LedgerPostInputSchema,
  type JournalEntry,
  type JournalLine,
  type JournalSource,
  type LedgerBook,
  type LedgerErrorKind,
  type LedgerPostInput,
  type LedgerResult,
  type SuiteAppId,
} from '@midnite/studio-shared';

export type BookStoreOptions = {
  /** The book's folder: `book.json`, `journal.ndjson`, `writer.lock`. */
  dir: string;
  appId: SuiteAppId;
  now?: () => Date;
  warn?: (message: string) => void;
};

export type Balance = { debit: number; credit: number };
export type PostValue = { entry: JournalEntry; duplicate: boolean };

/** Thrown by {@link openBookStore} when `book.json` fails its schema; the file has been moved aside. */
export class CorruptBookError extends Error {
  constructor(
    readonly dir: string,
    readonly movedTo: string | null,
  ) {
    super(`book.json in ${dir} is unreadable`);
  }
}

export type BookStore = {
  readonly dir: string;
  /** True when another process holds the writer lock, or the journal has a corrupt line. */
  readonly readOnly: boolean;
  /** Which app holds the writer lock when this store is read-only for that reason. */
  readonly lockedBy: SuiteAppId | null;
  /** Line numbers (1-based) of journal lines that failed their schema; null when the journal is sound. */
  readonly corrupt: { lines: number[] } | null;
  readonly revision: number;
  book(): LedgerBook;
  entries(): readonly JournalEntry[];
  /** Cumulative debit/credit per account over every posted entry. */
  balances(): ReadonlyMap<string, Balance>;
  /** Re-reads the files when another writer changed them (read-only stores only). */
  refresh(): Promise<void>;
  post(input: LedgerPostInput, source: JournalSource): Promise<LedgerResult<PostValue>>;
  reverse(entryId: string, date: string, reason: string): Promise<LedgerResult<PostValue>>;
  /** Replaces `book.json` with the result of `change` (temp + rename); a returned string is an error message. */
  updateBook(change: (book: LedgerBook) => LedgerBook | string): Promise<LedgerResult<LedgerBook>>;
  dispose(): Promise<void>;
};

const fail = (kind: LedgerErrorKind, message: string): { ok: false; kind: LedgerErrorKind; message: string } => ({ ok: false, kind, message });
const sourceKey = (s: JournalSource): string | null => (s.ref === undefined ? null : `${s.app}|${s.kind}|${s.ref}`);

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

type LockInfo = { pid: number; appId: SuiteAppId; startedAt: string };

async function readLock(path: string): Promise<LockInfo | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<LockInfo>;
    return typeof parsed.pid === 'number' && typeof parsed.appId === 'string' ? (parsed as LockInfo) : null;
  } catch {
    return null;
  }
}

/** Opens one book: loads it tolerantly, then takes (or fails to take) the single-writer lock. */
export async function openBookStore(opts: BookStoreOptions): Promise<BookStore> {
  const { dir, appId } = opts;
  const now = opts.now ?? ((): Date => new Date());
  const bookPath = join(dir, 'book.json');
  const journalPath = join(dir, 'journal.ndjson');
  const lockPath = join(dir, 'writer.lock');

  let book: LedgerBook;
  let entries: JournalEntry[] = [];
  let balances = new Map<string, Balance>();
  let bySource = new Map<string, JournalEntry>();
  let byId = new Map<string, JournalEntry>();
  let corrupt: { lines: number[] } | null = null;
  let lockedBy: SuiteAppId | null = null;
  let ownsLock = false;
  let seen = { journal: '', book: '' };
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  async function loadBook(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(bookPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new CorruptBookError(dir, null);
      throw err;
    }
    let parsed: ReturnType<typeof LedgerBookSchema.safeParse>;
    try {
      parsed = LedgerBookSchema.safeParse(JSON.parse(raw));
    } catch {
      parsed = LedgerBookSchema.safeParse(undefined);
    }
    if (!parsed.success) {
      const movedTo = join(dir, `book.corrupt-${Date.now()}.json`);
      await rename(bookPath, movedTo);
      throw new CorruptBookError(dir, movedTo);
    }
    book = parsed.data;
  }

  const statKey = async (path: string): Promise<string> => {
    try {
      const s = await stat(path);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return 'none';
    }
  };

  async function loadJournal(writable: boolean): Promise<void> {
    let text = '';
    try {
      text = await readFile(journalPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const lines = text === '' ? [] : text.split('\n');
    const endsClean = text === '' || text.endsWith('\n');
    if (endsClean && lines.length > 0) lines.pop(); // the empty string after the final newline
    const loaded: JournalEntry[] = [];
    const badLines: number[] = [];
    let needsNewline = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (line.trim() === '') continue;
      const isTornTail = !endsClean && i === lines.length - 1;
      let entry: JournalEntry | null = null;
      try {
        const parsed = JournalEntrySchema.safeParse(JSON.parse(line));
        if (parsed.success) entry = parsed.data;
      } catch {
        entry = null;
      }
      if (entry) {
        loaded.push(entry);
        // A valid last line that merely lacked its newline: terminate it so the next append starts clean.
        if (isTornTail) needsNewline = true;
      } else if (isTornTail) {
        if (writable) {
          await truncate(journalPath, Buffer.byteLength(text.slice(0, text.length - line.length)));
          opts.warn?.(`ledger: dropped a torn final line in ${book.id}`);
        }
      } else {
        badLines.push(i + 1);
      }
    }
    if (writable && needsNewline) await appendFile(journalPath, '\n');
    entries = loaded;
    corrupt = badLines.length > 0 ? { lines: badLines } : null;
    balances = new Map();
    bySource = new Map();
    byId = new Map();
    for (const e of entries) index(e);
  }

  function index(entry: JournalEntry): void {
    byId.set(entry.id, entry);
    const key = sourceKey(entry.source);
    if (key) bySource.set(key, entry);
    for (const line of entry.lines) {
      const b = balances.get(line.accountId) ?? { debit: 0, credit: 0 };
      balances.set(line.accountId, line.side === 'debit' ? { debit: b.debit + line.minor, credit: b.credit } : { debit: b.debit, credit: b.credit + line.minor });
    }
  }

  async function acquireLock(): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, appId, startedAt: now().toISOString() } satisfies LockInfo));
        } finally {
          await handle.close();
        }
        lockedBy = null;
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        const info = await readLock(lockPath);
        if (info && pidAlive(info.pid)) {
          lockedBy = info.appId;
          return false;
        }
        // Stale (dead pid) or unreadable: take it over, unless another opener already did (the lock changed under us).
        const again = await readLock(lockPath);
        if (again?.pid === info?.pid && again?.startedAt === info?.startedAt) await unlink(lockPath).catch(() => undefined);
      }
    }
    return false;
  }

  await mkdir(dir, { recursive: true });
  await loadBook();
  const gotLock = await acquireLock();
  ownsLock = gotLock;
  await loadJournal(gotLock);
  seen = { journal: await statKey(journalPath), book: await statKey(bookPath) };

  const isReadOnly = (): boolean => !ownsLock || corrupt !== null;
  const readOnlyError = (): LedgerResult<never> =>
    corrupt
      ? fail('read-only', `This book has corrupt journal lines (${corrupt.lines.join(', ')}) and is read-only.`)
      : fail('read-only', `Open in ${lockedBy ?? 'another app'} — this book is being written there.`);

  async function append(entry: JournalEntry): Promise<void> {
    const handle = await open(journalPath, 'a');
    try {
      await handle.write(`${JSON.stringify(entry)}\n`);
      await handle.datasync();
    } finally {
      await handle.close();
    }
    entries.push(entry);
    index(entry);
    seen.journal = await statKey(journalPath);
  }

  function validate(input: LedgerPostInput): LedgerResult<never> | null {
    const parsed = LedgerPostInputSchema.safeParse(input);
    if (!parsed.success) {
      const sum = (side: JournalLine['side']): number => input.lines.reduce((t, l) => (l.side === side ? t + l.minor : t), 0);
      return sum('debit') !== sum('credit') ? fail('unbalanced', 'Debits and credits must be equal.') : fail('invalid', parsed.error.issues[0]?.message ?? 'Invalid entry.');
    }
    for (const line of input.lines) {
      const account = book.accounts.find((a) => a.id === line.accountId);
      if (!account) return fail('not-found', 'An account on this entry does not exist.');
      if (account.archived) return fail('archived-account', `Account ${account.code} ${account.name} is archived.`);
    }
    if (book.lockedThrough !== null && input.date <= book.lockedThrough) return fail('locked-period', `Books are locked through ${book.lockedThrough}.`);
    return null;
  }

  async function postLocked(input: LedgerPostInput, source: JournalSource): Promise<LedgerResult<PostValue>> {
    if (isReadOnly()) return readOnlyError();
    const key = sourceKey(source);
    const existing = key ? bySource.get(key) : undefined;
    if (existing) return { ok: true, value: { entry: existing, duplicate: true } };
    const bad = validate(input);
    if (bad) return bad;
    const entry: JournalEntry = { ...input, source, id: randomUUID(), postedAt: now().toISOString() };
    await append(entry);
    return { ok: true, value: { entry, duplicate: false } };
  }

  const store: BookStore = {
    dir,
    get readOnly() {
      return isReadOnly();
    },
    get lockedBy() {
      return lockedBy;
    },
    get corrupt() {
      return corrupt;
    },
    get revision() {
      return entries.length;
    },
    book: () => book,
    entries: () => entries,
    balances: () => balances,
    async refresh() {
      if (ownsLock) return;
      await serial(async () => {
        const next = { journal: await statKey(journalPath), book: await statKey(bookPath) };
        if (next.journal === seen.journal && next.book === seen.book) return;
        if (next.book !== seen.book) await loadBook().catch(() => undefined);
        await loadJournal(false);
        seen = next;
        // The writer may have released since: take over if so.
        if (!ownsLock && (await acquireLock())) {
          ownsLock = true;
          await loadJournal(true);
        }
      });
    },
    post: (input, source) => serial(() => postLocked(input, source)),
    reverse: (entryId, date, reason) =>
      serial(async () => {
        if (isReadOnly()) return readOnlyError();
        const original = byId.get(entryId);
        if (!original) return fail('not-found', 'That entry does not exist.');
        const description = `Reversal: ${original.description} — ${reason}`.slice(0, 200);
        const lines: JournalLine[] = original.lines.map((l) => ({ ...l, side: l.side === 'debit' ? 'credit' : 'debit' }));
        return postLocked({ date, description, lines, source: { app: appId, kind: 'reversal', ref: entryId }, reverses: entryId }, { app: appId, kind: 'reversal', ref: entryId });
      }),
    updateBook: (change) =>
      serial(async () => {
        if (!ownsLock) return readOnlyError();
        const next = change(book);
        if (typeof next === 'string') return fail('invalid', next);
        const parsed = LedgerBookSchema.safeParse(next);
        if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message ?? 'Invalid book.');
        const tmp = `${bookPath}.${process.pid}.tmp`;
        await writeFile(tmp, `${JSON.stringify(parsed.data, null, 2)}\n`);
        await rename(tmp, bookPath);
        book = parsed.data;
        seen.book = await statKey(bookPath);
        return { ok: true, value: book };
      }),
    async dispose() {
      await queue.catch(() => undefined);
      if (!ownsLock) return;
      ownsLock = false;
      const info = await readLock(lockPath);
      if (info && info.pid === process.pid) await unlink(lockPath).catch(() => undefined);
    },
  };
  return store;
}
