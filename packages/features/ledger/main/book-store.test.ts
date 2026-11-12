// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LedgerBook } from '@midnite/studio-shared';

import { CorruptBookError, openBookStore, type BookStore } from './book-store';
import { CHART_TEMPLATES } from './chart-templates';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';
const acc = (code: string) => `00000000-0000-4000-8000-${code.padStart(12, '0')}`;
const BANK = acc('1000');
const SALES = acc('4000');
const FEES = acc('6400');

function makeBook(over: Partial<LedgerBook> = {}): LedgerBook {
  const base = CHART_TEMPLATES['sole-trader'].map((a) => ({ ...a, id: acc(a.code), archived: a.archived ?? false, taxTreatment: a.taxTreatment ?? 'none' }));
  return { version: 1, id: BOOK_ID, name: 'Acme', entity: 'sole-trader', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, lockedThrough: null, jurisdiction: null, accounts: base as LedgerBook['accounts'], rules: [], createdAt: '2026-01-01T00:00:00.000Z', ...over };
}

const sale = (date: string, minor: number, ref?: string) => ({
  date,
  description: 'Sale',
  lines: [
    { accountId: BANK, side: 'debit' as const, minor },
    { accountId: SALES, side: 'credit' as const, minor },
  ],
  source: { app: 'money' as const, kind: 'manual' as const, ...(ref ? { ref } : {}) },
});

const stores: BookStore[] = [];
afterEach(async () => {
  while (stores.length) await stores.pop()?.dispose();
});

async function fresh(book: LedgerBook = makeBook()): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'book-store-'));
  await writeFile(join(dir, 'book.json'), JSON.stringify(book));
  return dir;
}
async function open(dir: string, appId: 'money' | 'studio' = 'money', warn?: (m: string) => void): Promise<BookStore> {
  const s = await openBookStore({ dir, appId, now: () => new Date('2026-06-01T00:00:00Z'), warn });
  stores.push(s);
  return s;
}

describe('book store: persistence', () => {
  it('post then reopen gives the same balances', async () => {
    const dir = await fresh();
    const a = await open(dir);
    expect((await a.post(sale('2026-05-01', 1000), sale('2026-05-01', 1000).source)).ok).toBe(true);
    await a.dispose();
    const b = await open(dir);
    expect(b.balances().get(BANK)).toEqual({ debit: 1000, credit: 0 });
    expect(b.revision).toBe(1);
  });

  it('serialises 20 concurrent posts into 20 lines', async () => {
    const dir = await fresh();
    const s = await open(dir);
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.post(sale('2026-05-01', 100 + i), { app: 'money', kind: 'manual' })));
    expect(s.revision).toBe(20);
    expect((await readFile(join(dir, 'journal.ndjson'), 'utf8')).trim().split('\n')).toHaveLength(20);
  });
});

describe('book store: single writer', () => {
  it('a second store is read-only, then a third opens writable after dispose', async () => {
    const dir = await fresh();
    const first = await open(dir, 'money');
    const second = await open(dir, 'studio');
    expect(second.readOnly).toBe(true);
    const r = await second.post(sale('2026-05-01', 5), { app: 'studio', kind: 'manual' });
    expect(r).toEqual({ ok: false, kind: 'read-only', message: 'Open in money — this book is being written there.' });
    await second.dispose(); // a read-only store never releases the writer's lock
    expect(await readdir(dir)).toContain('writer.lock');
    await first.dispose();
    expect(await readdir(dir)).not.toContain('writer.lock');
    expect((await open(dir)).readOnly).toBe(false);
  });

  it('takes over a lock naming a dead pid', async () => {
    const dir = await fresh();
    const child = spawnSync(process.execPath, ['-e', '']);
    await writeFile(join(dir, 'writer.lock'), JSON.stringify({ pid: child.pid, appId: 'studio', startedAt: 'x' }));
    const s = await open(dir);
    expect(s.readOnly).toBe(false);
  });

  it("a read-only store sees the writer's later append", async () => {
    const dir = await fresh();
    const writer = await open(dir, 'money');
    const reader = await open(dir, 'studio');
    expect(reader.revision).toBe(0);
    await writer.post(sale('2026-05-01', 700), { app: 'money', kind: 'manual' });
    await reader.refresh();
    expect(reader.revision).toBe(1);
    expect(reader.balances().get(SALES)).toEqual({ debit: 0, credit: 700 });
  });
});

describe('book store: tolerant load', () => {
  it('drops a torn final line and reopens writable', async () => {
    const dir = await fresh();
    const a = await open(dir);
    await a.post(sale('2026-05-01', 100), { app: 'money', kind: 'manual' });
    await a.dispose();
    await appendFile(join(dir, 'journal.ndjson'), '{"id":"half');
    const warnings: string[] = [];
    const b = await open(dir, 'money', (m) => warnings.push(m));
    expect(b.readOnly).toBe(false);
    expect(b.revision).toBe(1);
    expect(warnings).toEqual([`ledger: dropped a torn final line in ${BOOK_ID}`]);
    expect((await readFile(join(dir, 'journal.ndjson'), 'utf8')).endsWith('\n')).toBe(true);
    expect((await b.post(sale('2026-05-02', 50), { app: 'money', kind: 'manual' })).ok).toBe(true);
  });

  it('a bad middle line opens read-only and names the line', async () => {
    const dir = await fresh();
    const a = await open(dir);
    for (let i = 0; i < 4; i += 1) await a.post(sale('2026-05-01', 10 + i), { app: 'money', kind: 'manual' });
    await a.dispose();
    const lines = (await readFile(join(dir, 'journal.ndjson'), 'utf8')).split('\n');
    lines[2] = '{"not":"an entry"}';
    await writeFile(join(dir, 'journal.ndjson'), lines.join('\n'));
    const b = await open(dir);
    expect(b.readOnly).toBe(true);
    expect(b.corrupt).toEqual({ lines: [3] });
    expect(b.revision).toBe(3);
    expect(await b.post(sale('2026-05-02', 5), { app: 'money', kind: 'manual' })).toMatchObject({ ok: false, kind: 'read-only' });
  });

  it('moves an invalid book.json aside and throws CorruptBookError', async () => {
    const dir = await fresh();
    await writeFile(join(dir, 'book.json'), '{"nope":true}');
    await expect(openBookStore({ dir, appId: 'money' })).rejects.toBeInstanceOf(CorruptBookError);
    expect((await readdir(dir)).some((f) => f.startsWith('book.corrupt-'))).toBe(true);
  });
});

describe('book store: posting rules', () => {
  it('rejects an unbalanced entry', async () => {
    const s = await open(await fresh());
    const bad = { ...sale('2026-05-01', 100), lines: [{ accountId: BANK, side: 'debit' as const, minor: 100 }, { accountId: SALES, side: 'credit' as const, minor: 90 }] };
    expect(await s.post(bad, bad.source)).toMatchObject({ ok: false, kind: 'unbalanced' });
  });

  it('rejects a date on or before lockedThrough', async () => {
    const s = await open(await fresh(makeBook({ lockedThrough: '2026-03-31' })));
    expect(await s.post(sale('2026-03-31', 1), { app: 'money', kind: 'manual' })).toMatchObject({ ok: false, kind: 'locked-period' });
    expect((await s.post(sale('2026-04-01', 1), { app: 'money', kind: 'manual' })).ok).toBe(true);
  });

  it('rejects an archived account and an unknown one', async () => {
    const book = makeBook();
    book.accounts = book.accounts.map((a) => (a.id === FEES ? { ...a, archived: true } : a));
    const s = await open(await fresh(book));
    const toFees = { ...sale('2026-05-01', 5), lines: [{ accountId: FEES, side: 'debit' as const, minor: 5 }, { accountId: BANK, side: 'credit' as const, minor: 5 }] };
    expect(await s.post(toFees, toFees.source)).toMatchObject({ ok: false, kind: 'archived-account' });
    const ghost = { ...sale('2026-05-01', 5), lines: [{ accountId: acc('9'), side: 'debit' as const, minor: 5 }, { accountId: BANK, side: 'credit' as const, minor: 5 }] };
    expect(await s.post(ghost, ghost.source)).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('the same source ref twice appends one line', async () => {
    const dir = await fresh();
    const s = await open(dir);
    const input = sale('2026-05-01', 100, 'abc');
    const one = await s.post(input, input.source);
    const two = await s.post(input, input.source);
    expect(one).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(two).toMatchObject({ ok: true, value: { duplicate: true } });
    expect((await readFile(join(dir, 'journal.ndjson'), 'utf8')).trim().split('\n')).toHaveLength(1);
  });
});

describe('book store: reversal', () => {
  it('returns every balance to zero and a second reversal is a duplicate', async () => {
    const s = await open(await fresh());
    const posted = await s.post(sale('2026-05-01', 250), { app: 'money', kind: 'manual' });
    if (!posted.ok) throw new Error('post failed');
    const rev = await s.reverse(posted.value.entry.id, '2026-05-02', 'wrong customer');
    expect(rev).toMatchObject({ ok: true, value: { duplicate: false, entry: { reverses: posted.value.entry.id, source: { kind: 'reversal' } } } });
    for (const b of s.balances().values()) expect(b.debit).toBe(b.credit);
    expect((await s.reverse(posted.value.entry.id, '2026-05-03', 'again')).ok && (await s.reverse(posted.value.entry.id, '2026-05-03', 'again'))).toMatchObject({ value: { duplicate: true } });
    expect(s.revision).toBe(2);
  });

  it('answers not-found for an unknown entry', async () => {
    const s = await open(await fresh());
    expect(await s.reverse(BOOK_ID, '2026-05-02', 'x')).toMatchObject({ ok: false, kind: 'not-found' });
  });
});

describe('book store: updateBook', () => {
  it('writes book.json and refuses a change that fails the schema', async () => {
    const dir = await fresh();
    const s = await open(dir);
    expect(await s.updateBook((b) => ({ ...b, name: 'Renamed' }))).toMatchObject({ ok: true });
    expect(JSON.parse(await readFile(join(dir, 'book.json'), 'utf8')).name).toBe('Renamed');
    expect(await s.updateBook(() => 'nope')).toEqual({ ok: false, kind: 'invalid', message: 'nope' });
    expect(await s.updateBook((b) => ({ ...b, name: '' }))).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
