// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CHANNELS, type LedgerAccount, type LedgerBook } from '@midnite/studio-shared';

import { createLedgerService, ledgerMain, type LedgerService } from './index';

type Handler = (payload: unknown) => Promise<unknown>;

const created: LedgerService[] = [];
afterEach(async () => {
  while (created.length) await created.pop()?.dispose();
});

function register(service: LedgerService, appId: 'money' | 'studio' = 'money') {
  const handlers = new Map<string, { handler: Handler; onInvalid: (i: string) => unknown }>();
  const ipc = {
    handle: (channel: string, _schema: never, handler: Handler, onInvalid: (i: string) => unknown) => void handlers.set(channel, { handler, onInvalid }),
    handleBare: () => {},
    send: () => {},
  };
  ledgerMain.register({ ipc: ipc as never, emit: () => {}, trashItem: async () => {} }, { service, appId, pickCsv: async () => null, saveCsv: async () => null });
  return handlers.get(CHANNELS.ledger)!;
}

async function seeded(appId: 'money' | 'studio' = 'money') {
  const root = await mkdtemp(join(tmpdir(), 'ledger-main-'));
  const service = createLedgerService({ root, appId });
  created.push(service);
  const made = await service.createBook({ name: 'Acme', entity: 'sole-trader', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: 'sole-trader' });
  if (!made.ok) throw new Error(made.message);
  const book: LedgerBook = made.value.book;
  const acct = (name: string): LedgerAccount => book.accounts.find((a) => a.name === name) as LedgerAccount;
  return { service, book, acct, ...register(service, appId) };
}

describe('ledgerMain', () => {
  it('registers exactly the ledger channel', () => {
    expect(ledgerMain.channels).toEqual([CHANNELS.ledger]);
  });

  it('answers each implemented op ok on a seeded book', async () => {
    const { handler, book, acct } = await seeded();
    const entry = { date: '2026-05-01', description: 'Sale', lines: [{ accountId: acct('Bank').id, side: 'debit', minor: 500 }, { accountId: acct('Sales').id, side: 'credit', minor: 500 }], source: { app: 'money', kind: 'manual' } };
    const posted = (await handler({ op: 'post', bookId: book.id, entry })) as { ok: boolean; value: { entry: { id: string } } };
    expect(posted.ok).toBe(true);
    const requests: Record<string, unknown>[] = [
      { op: 'listBooks' },
      { op: 'getBook', bookId: book.id },
      { op: 'updateBook', bookId: book.id, patch: { name: 'Acme 2' } },
      { op: 'upsertAccount', bookId: book.id, account: { code: '6950', name: 'Gifts', type: 'expense', subtype: 'operating-expense' } },
      { op: 'archiveAccount', bookId: book.id, accountId: acct('Cash').id },
      { op: 'reverse', bookId: book.id, entryId: posted.value.entry.id, date: '2026-05-02', reason: 'oops' },
      { op: 'journal', bookId: book.id },
      { op: 'balances', bookId: book.id, asOf: '2026-12-31' },
      { op: 'importPick', bookId: book.id },
      { op: 'report', bookId: book.id, kind: 'trial-balance', from: '2026-04-06', to: '2026-12-31' },
      { op: 'exportReport', bookId: book.id, kind: 'balance-sheet', from: '2026-04-06', to: '2026-12-31' },
    ];
    for (const req of requests) expect(await handler(req), String(req.op)).toMatchObject({ ok: true });
  });

  it('stamps source.app from the host, not the request', async () => {
    const { handler, book, acct } = await seeded('studio');
    const entry = { date: '2026-05-01', description: 'Sale', lines: [{ accountId: acct('Bank').id, side: 'debit', minor: 5 }, { accountId: acct('Sales').id, side: 'credit', minor: 5 }], source: { app: 'money', kind: 'manual' } };
    expect(await handler({ op: 'post', bookId: book.id, entry })).toMatchObject({ ok: true, value: { entry: { source: { app: 'studio', kind: 'manual' } } } });
  });

  it('turns an fs error into io, never a throw', async () => {
    const { service } = await seeded();
    const broken: LedgerService = { ...service, listBooks: () => Promise.reject(new Error('EIO: disk gone')) };
    const { handler } = register(broken);
    expect(await handler({ op: 'listBooks' })).toEqual({ ok: false, kind: 'io', message: 'EIO: disk gone' });
  });

  it('answers ops with no service method yet as invalid', async () => {
    const { handler, book } = await seeded();
    expect(await handler({ op: 'taxEstimate', bookId: book.id, taxYear: 2025 })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('reports a bad payload through the envelope', async () => {
    const { onInvalid } = await seeded();
    expect(onInvalid('nope')).toEqual({ ok: false, kind: 'invalid', message: 'nope' });
  });
});
