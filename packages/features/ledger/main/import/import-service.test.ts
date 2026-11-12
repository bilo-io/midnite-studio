// @vitest-environment node
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EVENT_CHANNELS, type ImportMapping, type LedgerAccount, type LedgerBook } from '@midnite/studio-shared';

import { createLedgerService, type LedgerService } from '../ledger-service';
import { createImportService, parseStatementDate, suggestAccount, type ImportService } from './import-service';

const open: LedgerService[] = [];
afterEach(async () => {
  while (open.length) await open.pop()?.dispose();
});

async function setup(csv: string) {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-import-'));
  const file = join(dir, 'statement.csv');
  await writeFile(file, csv);
  const events: unknown[] = [];
  const service = createLedgerService({ root: join(dir, 'books'), appId: 'money', now: () => new Date('2026-06-01T00:00:00Z'), send: (c, p) => events.push([c, p]) });
  open.push(service);
  const made = await service.createBook({ name: 'Acme', entity: 'sole-trader', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: 'sole-trader' });
  if (!made.ok) throw new Error(made.message);
  const book = made.value.book;
  const acct = (name: string): LedgerAccount => book.accounts.find((a) => a.name === name) as LedgerAccount;
  let next: string | null = file;
  const imports: ImportService = createImportService({ service, appId: 'money', pickCsv: async () => next });
  const pick = async () => {
    const r = await imports.pick(book.id);
    if (!r.ok || !r.value) throw new Error('pick failed');
    return r.value;
  };
  return { service, imports, book, acct, pick, file, events, cancel: () => (next = null) };
}

const single = (token: string, bank: string, extra: Partial<ImportMapping> = {}): ImportMapping => ({
  token,
  bankAccountId: bank,
  date: { column: 0, format: 'YYYY-MM-DD' },
  description: 1,
  amount: { kind: 'single', column: 2, negativeIsOutflow: true },
  ...extra,
});

describe('import service', () => {
  it('picks a file, keeping the path in main, and returns the header and a sample', async () => {
    const { pick } = await setup('Date,Description,Amount\n2026-05-01,Coffee,-3.50\n');
    const picked = await pick();
    expect(picked.header).toEqual(['Date', 'Description', 'Amount']);
    expect(picked.sample).toEqual([['2026-05-01', 'Coffee', '-3.50']]);
    expect(JSON.stringify(picked)).not.toContain('statement.csv');
  });

  it('answers null when the dialog is cancelled, and refuses an oversize file', async () => {
    const s = await setup('a,b\n1,2\n');
    s.cancel();
    expect(await s.imports.pick(s.book.id)).toEqual({ ok: true, value: null });
    const big = await setup(`a,b\n${'1,2\n'.repeat(20_001)}`);
    expect(await big.imports.pick(big.book.id)).toMatchObject({ ok: false, kind: 'invalid', message: expect.stringContaining('larger than') });
  });

  it('previews a single signed column, both signs of negativeIsOutflow', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,Coffee,-3.50\n2026-05-02,Client pays,1200.00\n');
    const { token } = await s.pick();
    const out = await s.imports.preview(s.book.id, single(token, s.acct('Bank').id));
    expect(out).toMatchObject({ ok: true, value: { rows: [{ minor: -350, duplicate: false }, { minor: 120000 }] } });
    const flipped = await s.imports.preview(s.book.id, single(token, s.acct('Bank').id, { amount: { kind: 'single', column: 2, negativeIsOutflow: false } }));
    expect(flipped).toMatchObject({ ok: true, value: { rows: [{ minor: 350 }, { minor: -120000 }] } });
  });

  it('previews split in/out columns and reads three date formats', async () => {
    const s = await setup('Date,Description,In,Out\n05/06/2026,Rent,,"1,000.00"\n13/06/2026,Refund,25.00,\n');
    const { token } = await s.pick();
    const split = (format: ImportMapping['date']['format']): ImportMapping => ({
      token,
      bankAccountId: s.acct('Bank').id,
      date: { column: 0, format },
      description: 1,
      amount: { kind: 'split', inColumn: 2, outColumn: 3 },
    });
    const dmy = await s.imports.preview(s.book.id, split('DD/MM/YYYY'));
    expect(dmy).toMatchObject({ ok: true, value: { rows: [{ date: '2026-06-05', minor: -100000 }, { date: '2026-06-13', minor: 2500 }] } });
    const mdy = await s.imports.preview(s.book.id, split('MM/DD/YYYY'));
    expect(mdy).toMatchObject({ ok: true, value: { rows: [{ date: '2026-05-06' }, { error: expect.stringContaining('MM/DD/YYYY') }] } });
    expect(parseStatementDate('2026-02-30', 'YYYY-MM-DD')).toBeNull();
    expect(parseStatementDate('2026-1-5', 'YYYY-MM-DD')).toBe('2026-01-05');
  });

  it('reads a decimal comma without turning 12,50 into 1250', async () => {
    const s = await setup('Date;Description;Amount\n2026-05-01;Lunch;-12,50\n2026-05-02;Big;"-1.234,56"\n');
    const { token } = await s.pick();
    const out = await s.imports.preview(s.book.id, single(token, s.acct('Bank').id));
    expect(out).toMatchObject({ ok: true, value: { rows: [{ minor: -1250 }, { minor: -123456 }] } });
  });

  it('flags a bad row with an error and never aborts the batch', async () => {
    const s = await setup('Date,Description,Amount\nnope,Coffee,-3.50\n2026-05-02,Tea,-2.00\n');
    const { token } = await s.pick();
    const mapping = single(token, s.acct('Bank').id);
    const out = await s.imports.preview(s.book.id, mapping);
    expect(out).toMatchObject({ ok: true, value: { rows: [{ error: expect.stringContaining('not YYYY-MM-DD') }, { minor: -200 }] } });
    const res = await s.imports.commit(s.book.id, mapping, [
      { index: 0, accountId: s.acct('Sales').id },
      { index: 1, accountId: s.acct('Sales').id },
    ]);
    expect(res).toMatchObject({ ok: true, value: { posted: 1, duplicates: 0, failed: [{ index: 0 }] } });
  });

  it('applies rules by ascending priority, and skips an archived account', () => {
    const book = {
      accounts: [
        { id: 'a', archived: false },
        { id: 'b', archived: false },
        { id: 'c', archived: true },
      ],
      rules: [
        { id: '1', match: { field: 'description', contains: 'TESCO' }, accountId: 'b', priority: 2 },
        { id: '2', match: { field: 'description', contains: 'tesco' }, accountId: 'a', priority: 1 },
        { id: '3', match: { field: 'description', contains: 'cafe' }, accountId: 'c', priority: 0 },
      ],
    } as unknown as LedgerBook;
    expect(suggestAccount(book, 'Tesco Express')).toBe('a');
    expect(suggestAccount(book, 'Cafe Nero')).toBeNull();
    expect(suggestAccount(book, 'Other')).toBeNull();
  });

  it('commits one entry per row, then a re-import posts nothing', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,Coffee,-3.50\n2026-05-02,Client pays,1200.00\n');
    const { token } = await s.pick();
    const mapping = single(token, s.acct('Bank').id);
    const rows = [
      { index: 0, accountId: s.acct('Software & subscriptions').id },
      { index: 1, accountId: s.acct('Sales').id },
    ];
    expect(await s.imports.commit(s.book.id, mapping, rows)).toEqual({ ok: true, value: { posted: 2, duplicates: 0, failed: [] } });
    const journal = await s.service.journal({ bookId: s.book.id });
    expect(journal).toMatchObject({ ok: true, value: { entries: [{ source: { kind: 'import' } }, { source: { kind: 'import' } }] } });
    // Same file picked again: new token, same rows.
    const again = await s.pick();
    const second = single(again.token, s.acct('Bank').id);
    expect(await s.imports.preview(s.book.id, second)).toMatchObject({ ok: true, value: { rows: [{ duplicate: true }, { duplicate: true }] } });
    expect(await s.imports.commit(s.book.id, second, rows)).toEqual({ ok: true, value: { posted: 0, duplicates: 2, failed: [] } });
  });

  it('keeps two genuinely identical rows, and re-import posts neither again', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,Coffee,-3.50\n2026-05-01,Coffee,-3.50\n');
    const { token } = await s.pick();
    const mapping = single(token, s.acct('Bank').id);
    const rows = [0, 1].map((index) => ({ index, accountId: s.acct('Software & subscriptions').id }));
    expect(await s.imports.commit(s.book.id, mapping, rows)).toMatchObject({ ok: true, value: { posted: 2, duplicates: 0 } });
    const again = await s.pick();
    expect(await s.imports.commit(s.book.id, single(again.token, s.acct('Bank').id), rows)).toMatchObject({ ok: true, value: { posted: 0, duplicates: 2 } });
  });

  it('emits ledgerChanged once per commit, not once per row', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,A,-1.00\n2026-05-02,B,-2.00\n2026-05-03,C,-3.00\n');
    const { token } = await s.pick();
    s.events.length = 0;
    const rows = [0, 1, 2].map((index) => ({ index, accountId: s.acct('Software & subscriptions').id, remember: index === 0 }));
    expect(await s.imports.commit(s.book.id, single(token, s.acct('Bank').id), rows)).toMatchObject({ ok: true, value: { posted: 3 } });
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject([EVENT_CHANNELS.ledgerChanged, { bookId: s.book.id, revision: 3 }]);
  });

  it('refuses the bank account as the category and a stale token', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,Coffee,-3.50\n');
    const { token } = await s.pick();
    const mapping = single(token, s.acct('Bank').id);
    expect(await s.imports.commit(s.book.id, mapping, [{ index: 0, accountId: s.acct('Bank').id }])).toMatchObject({ ok: true, value: { posted: 0, failed: [{ index: 0 }] } });
    await s.pick();
    expect(await s.imports.preview(s.book.id, mapping)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('remembers a rule from a manual pick, which then suggests next time', async () => {
    const s = await setup('Date,Description,Amount\n2026-05-01,ADOBE *CREATIVE,-19.99\n');
    const { token } = await s.pick();
    const mapping = single(token, s.acct('Bank').id);
    await s.imports.commit(s.book.id, mapping, [{ index: 0, accountId: s.acct('Software & subscriptions').id, remember: true }]);
    const detail = await s.service.getBook(s.book.id);
    expect(detail).toMatchObject({ ok: true, value: { book: { rules: [{ match: { contains: 'ADOBE *CREATIVE' }, priority: 0 }] } } });
    const again = await s.pick();
    expect(await s.imports.preview(s.book.id, single(again.token, s.acct('Bank').id))).toMatchObject({
      ok: true,
      value: { rows: [{ suggestedAccountId: s.acct('Software & subscriptions').id }] },
    });
  });

  it('reports a locked period per row', async () => {
    const s = await setup('Date,Description,Amount\n2026-03-01,Old,-1.00\n2026-05-01,New,-2.00\n');
    await s.service.updateBook(s.book.id, { lockedThrough: '2026-04-30' });
    const { token } = await s.pick();
    const rows = [0, 1].map((index) => ({ index, accountId: s.acct('Software & subscriptions').id }));
    expect(await s.imports.commit(s.book.id, single(token, s.acct('Bank').id), rows)).toMatchObject({ ok: true, value: { posted: 1, failed: [{ index: 0, reason: expect.stringContaining('locked') }] } });
  });
});
