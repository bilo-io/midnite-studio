// @vitest-environment node
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EVENT_CHANNELS, type LedgerAccount } from '@midnite/studio-shared';

import { createLedgerService, type LedgerService } from './ledger-service';

const services: LedgerService[] = [];
afterEach(async () => {
  while (services.length) await services.pop()?.dispose();
});

async function setup(appId: 'money' | 'studio' = 'money', root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), 'ledger-svc-')));
  const events: unknown[] = [];
  const service = createLedgerService({ root: dir, appId, now: () => new Date('2026-06-01T00:00:00Z'), send: (c, p) => events.push([c, p]) });
  services.push(service);
  return { service, dir, events };
}

async function newBook(service: LedgerService, entity: 'sole-trader' | 'personal' | 'company' = 'sole-trader') {
  const r = await service.createBook({ name: 'Acme', entity, currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: entity });
  if (!r.ok) throw new Error(r.message);
  const acct = (name: string): LedgerAccount => r.value.book.accounts.find((a) => a.name === name) as LedgerAccount;
  return { book: r.value.book, acct };
}

const entry = (bank: string, sales: string, date: string, minor: number) => ({
  date,
  description: `Sale ${minor}`,
  lines: [
    { accountId: bank, side: 'debit' as const, minor },
    { accountId: sales, side: 'credit' as const, minor },
  ],
  source: { app: 'money' as const, kind: 'manual' as const },
});

describe('createLedgerService', () => {
  it('lists nothing before any book, then the created book from the template', async () => {
    const { service, events } = await setup();
    expect(await service.listBooks()).toEqual({ ok: true, value: { books: [] } });
    const { book } = await newBook(service);
    expect(book.accounts.length).toBeGreaterThan(15);
    const listed = await service.listBooks();
    expect(listed).toMatchObject({ ok: true, value: { books: [{ id: book.id, name: 'Acme', readOnly: false, revision: 0 }] } });
    expect(events[0]).toEqual([EVENT_CHANNELS.ledgerChanged, { bookId: book.id, revision: 0 }]);
  });

  it('posts, announces the revision and lists the journal newest first with a cursor', async () => {
    const { service, events } = await setup();
    const { book, acct } = await newBook(service);
    for (let i = 1; i <= 5; i += 1) await service.post({ bookId: book.id, entry: entry(acct('Bank').id, acct('Sales').id, `2026-05-0${i}`, i * 100) }, { app: 'money', kind: 'manual' });
    expect(events.at(-1)).toEqual([EVENT_CHANNELS.ledgerChanged, { bookId: book.id, revision: 5 }]);
    const page1 = await service.journal({ bookId: book.id, limit: 2 });
    if (!page1.ok) throw new Error('journal');
    expect(page1.value.entries.map((e) => e.description)).toEqual(['Sale 500', 'Sale 400']);
    const page2 = await service.journal({ bookId: book.id, limit: 2, cursor: page1.value.nextCursor ?? '' });
    if (!page2.ok) throw new Error('journal 2');
    expect(page2.value.entries.map((e) => e.description)).toEqual(['Sale 300', 'Sale 200']);
    const page3 = await service.journal({ bookId: book.id, limit: 2, cursor: page2.value.nextCursor ?? '' });
    expect(page3).toMatchObject({ ok: true, value: { nextCursor: null } });
    expect(await service.journal({ bookId: book.id, query: 'sale 3' })).toMatchObject({ ok: true, value: { entries: [{ description: 'Sale 300' }] } });
    expect(await service.journal({ bookId: book.id, accountId: acct('Sales').id, from: '2026-05-04' })).toMatchObject({ ok: true, value: { entries: [{ description: 'Sale 500' }, { description: 'Sale 400' }] } });
    expect(await service.journal({ bookId: book.id, cursor: 'x' })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('balances as of a date ignore later entries', async () => {
    const { service } = await setup();
    const { book, acct } = await newBook(service);
    await service.post({ bookId: book.id, entry: entry(acct('Bank').id, acct('Sales').id, '2026-05-01', 100) }, { app: 'money', kind: 'manual' });
    await service.post({ bookId: book.id, entry: entry(acct('Bank').id, acct('Sales').id, '2026-06-01', 40) }, { app: 'money', kind: 'manual' });
    const r = await service.balances(book.id, '2026-05-31');
    expect(r).toMatchObject({ ok: true, value: { balances: expect.arrayContaining([{ accountId: acct('Bank').id, debit: 100, credit: 0 }]) } });
  });

  it('upserts accounts: create, duplicate code refused, archive refused with a balance', async () => {
    const { service } = await setup();
    const { book, acct } = await newBook(service);
    const made = await service.upsertAccount(book.id, { code: '6950', name: 'Gifts', type: 'expense', subtype: 'operating-expense', archived: false, taxTreatment: 'allowable' });
    expect(made).toMatchObject({ ok: true, value: { account: { code: '6950', name: 'Gifts' } } });
    expect(await service.upsertAccount(book.id, { code: '6950', name: 'Dupe', type: 'expense', subtype: 'operating-expense', archived: false, taxTreatment: 'none' })).toMatchObject({ ok: false, kind: 'invalid' });
    await service.post({ bookId: book.id, entry: entry(acct('Bank').id, acct('Sales').id, '2026-05-01', 100) }, { app: 'money', kind: 'manual' });
    expect(await service.archiveAccount(book.id, acct('Bank').id)).toMatchObject({ ok: false, kind: 'invalid' });
    expect(made.ok && (await service.archiveAccount(book.id, made.value.account.id))).toMatchObject({ ok: true, value: { account: { archived: true } } });
  });

  it('updateBook locks the period, and a post inside it is refused', async () => {
    const { service } = await setup();
    const { book, acct } = await newBook(service);
    expect(await service.updateBook(book.id, { lockedThrough: '2026-03-31', name: 'Acme Ltd' })).toMatchObject({ ok: true, value: { book: { lockedThrough: '2026-03-31', name: 'Acme Ltd' } } });
    expect(await service.post({ bookId: book.id, entry: entry(acct('Bank').id, acct('Sales').id, '2026-03-01', 1) }, { app: 'money', kind: 'manual' })).toMatchObject({ ok: false, kind: 'locked-period' });
  });

  it('answers not-found for an unknown or malformed book id, never throwing', async () => {
    const { service } = await setup();
    expect(await service.balances('22222222-2222-4222-8222-222222222222', '2026-01-01')).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await service.balances('../etc', '2026-01-01')).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('a second service on the same root sees the book read-only', async () => {
    const first = await setup('money');
    const { book } = await newBook(first.service);
    const second = await setup('studio', first.dir);
    expect(await second.service.listBooks()).toMatchObject({ ok: true, value: { books: [{ id: book.id, readOnly: true }] } });
    expect(await second.service.post({ bookId: book.id, entry: entry('a', 'b', '2026-05-01', 1) }, { app: 'studio', kind: 'manual' })).toMatchObject({ ok: false });
  });

  it('lists a book with an unreadable book.json as corrupt instead of failing', async () => {
    const { service, dir } = await setup();
    const id = '33333333-3333-4333-8333-333333333333';
    await mkdir(join(dir, id));
    await writeFile(join(dir, id, 'book.json'), 'not json');
    const listed = await service.listBooks();
    expect(listed).toMatchObject({ ok: true, value: { books: [{ id, readOnly: true, corrupt: { lines: [] } }] } });
    expect((await readdir(join(dir, id))).some((f) => f.startsWith('book.corrupt-'))).toBe(true);
    expect(await service.balances(id, '2026-01-01')).toMatchObject({ ok: false, kind: 'corrupt' });
  });
});
