// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Invoice, LedgerPostRequest, StartupRequest } from '@midnite/studio-shared';

import type { StartupLedgerPort } from './ledger-port';
import { handleStartupRequest } from './service';
import { openWorkspaceStore, type WorkspaceStore } from './workspace-store';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACCOUNTS = { receivable: 'acc-recv', sales: 'acc-sales', taxPayable: 'acc-tax', bank: 'acc-bank' };

type Posted = { req: LedgerPostRequest; source: { kind: string; ref: string }; entryId: string };
/** An in-memory books port: idempotent on `source.ref`, with a switch to refuse the next post like a locked period. */
function memoryPort(overrides: Partial<StartupLedgerPort> = {}) {
  const posted: Posted[] = [];
  const reversed: { entryId: string; reason: string }[] = [];
  const state = { lock: false };
  const port: StartupLedgerPort = {
    listBooks: async () => ({ ok: true, value: [{ id: 'book-1', name: 'Acme Ltd', entity: 'company', currency: 'GBP', readOnly: false }, { id: 'book-usd', name: 'US', entity: 'company', currency: 'USD', readOnly: false }] }),
    accounts: async (bookId) => ({
      ok: true,
      value: {
        name: bookId,
        accounts: [
          { id: 'old-bank', code: '1010', type: 'asset', subtype: 'bank', archived: true },
          { id: ACCOUNTS.bank, code: '1020', type: 'asset', subtype: 'bank', archived: false },
          { id: ACCOUNTS.receivable, code: '1100', type: 'asset', subtype: 'receivable', archived: false },
          { id: ACCOUNTS.taxPayable, code: '2200', type: 'liability', subtype: 'tax-payable', archived: false },
          { id: ACCOUNTS.sales, code: '4000', type: 'income', subtype: 'sales', archived: false },
        ],
      },
    }),
    post: async (req, source) => {
      if (state.lock) return { ok: false, kind: 'locked-period', message: 'Books are locked through 2026-12-31.' };
      const existing = posted.find((p) => p.source.ref === source.ref && p.source.kind === source.kind);
      if (existing) return { ok: true, value: { entryId: existing.entryId, duplicate: true } };
      const entryId = u(900 + posted.length);
      posted.push({ req, source, entryId });
      return { ok: true, value: { entryId, duplicate: false } };
    },
    reverse: async (_book, entryId, _date, reason) => {
      reversed.push({ entryId, reason });
      return { ok: true, value: { entryId: u(990 + reversed.length) } };
    },
    cashBalance: async () => ({ ok: true, value: { minor: 0 } }),
    monthlyNet: async () => ({ ok: true, value: [] }),
    ...overrides,
  };
  return { port, posted, reversed, state };
}

const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } };
const customer = { id: u(30), name: 'Client', address: '' };
const draft = (n: number, lines: Invoice['lines'] = [{ description: 'Work', quantityMilli: 1500, unitMinor: 8000, taxRateBp: 2000 }]): Invoice => ({
  id: u(40 + n), number: null, customerId: u(30), issueDate: null, dueDate: null, notes: '', status: 'draft', entries: {}, lines,
});

async function setup(ledger = memoryPort()) {
  const store: WorkspaceStore = await openWorkspaceStore({ dir: await mkdtemp(join(tmpdir(), 'startup-inv-')) });
  const run = (request: StartupRequest, pdf = undefined) => handleStartupRequest(store, request, { ledger: ledger.port, now: () => new Date('2026-11-12T10:00:00Z'), ...(pdf ? { pdf } : {}) });
  await run({ op: 'updateCompany', company });
  await run({ op: 'upsertCustomer', customer });
  return { store, run, ...ledger };
}
const linked = async (ctx: Awaited<ReturnType<typeof setup>>) => {
  expect((await ctx.run({ op: 'linkBook', bookId: 'book-1' })).ok).toBe(true);
};
const invoiceOf = (store: WorkspaceStore, n: number) => store.snapshot().workspace.invoices.find((i) => i.id === u(40 + n))!;

describe('linkBook', () => {
  it('resolves the four accounts by subtype, skipping archived ones', async () => {
    const ctx = await setup();
    await linked(ctx);
    expect(ctx.store.snapshot().workspace.ledger).toEqual({ bookId: 'book-1', accounts: ACCOUNTS });
  });
  it('refuses a book in another currency, a missing book and a book without an account', async () => {
    const ctx = await setup();
    expect(await ctx.run({ op: 'linkBook', bookId: 'book-usd' })).toMatchObject({ ok: false, kind: 'ledger' });
    expect(await ctx.run({ op: 'linkBook', bookId: 'nope' })).toMatchObject({ ok: false, kind: 'not-found' });
    const bare = await setup(memoryPort({ accounts: async () => ({ ok: true, value: { name: 'Bare', accounts: [] } }) }));
    expect(await bare.run({ op: 'linkBook', bookId: 'book-1' })).toMatchObject({ ok: false, kind: 'ledger', message: 'Acme Ltd has no receivable account.' });
  });
  it('is fixed once an invoice is posted', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    expect(await ctx.run({ op: 'linkBook', bookId: null })).toMatchObject({ ok: false, kind: 'locked' });
  });
});

describe('issueInvoice', () => {
  it('needs a linked book and changes nothing without one', async () => {
    const ctx = await setup();
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    expect(await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).toMatchObject({ ok: false, kind: 'no-book' });
    expect(invoiceOf(ctx.store, 1).status).toBe('draft');
    expect(ctx.store.snapshot().workspace.invoiceCounter).toBe(0);
  });

  it('numbers gaplessly at issue and posts Dr receivable / Cr sales / Cr tax', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    await ctx.run({ op: 'upsertInvoice', invoice: draft(2) });
    await ctx.run({ op: 'upsertInvoice', invoice: draft(3) });
    expect(ctx.store.snapshot().workspace.invoiceCounter).toBe(0); // drafts burn no numbers
    expect((await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).ok).toBe(true);
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ number: 'INV-0001', status: 'issued', issueDate: '2026-11-12', dueDate: '2026-12-12' });
    expect(ctx.posted).toHaveLength(1);
    expect(ctx.posted[0]?.source).toEqual({ kind: 'invoice', ref: u(41) });
    expect(ctx.posted[0]?.req.entry.lines).toEqual([
      { accountId: ACCOUNTS.receivable, side: 'debit', minor: 14400, memo: 'INV-0001' },
      { accountId: ACCOUNTS.sales, side: 'credit', minor: 12000, memo: 'INV-0001' },
      { accountId: ACCOUNTS.taxPayable, side: 'credit', minor: 2400, memo: 'INV-0001' },
    ]);
    await ctx.run({ op: 'issueInvoice', id: u(42), issueDate: '2026-11-13' });
    expect(invoiceOf(ctx.store, 2).number).toBe('INV-0002');
  });

  it('numbers concurrent issues without a gap or a duplicate', async () => {
    const ctx = await setup();
    await linked(ctx);
    for (const n of [1, 2, 3, 4]) await ctx.run({ op: 'upsertInvoice', invoice: draft(n) });
    await Promise.all([1, 2, 3, 4].map((n) => ctx.run({ op: 'issueInvoice', id: u(40 + n), issueDate: '2026-11-12' })));
    const numbers = ctx.store.snapshot().workspace.invoices.map((i) => i.number).sort();
    expect(numbers).toEqual(['INV-0001', 'INV-0002', 'INV-0003', 'INV-0004']);
  });

  it('omits the tax line at 0 %', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1, [{ description: 'Zero-rated', quantityMilli: 1000, unitMinor: 5000, taxRateBp: 0 }]) });
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    expect(ctx.posted[0]?.req.entry.lines).toHaveLength(2);
  });

  it('leaves the invoice a draft and the counter alone when the period is locked, then succeeds on retry', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    ctx.state.lock = true;
    expect(await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).toMatchObject({ ok: false, kind: 'ledger' });
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ status: 'draft', number: null });
    expect(ctx.store.snapshot().workspace.invoiceCounter).toBe(0);
    ctx.state.lock = false;
    expect((await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).ok).toBe(true);
    expect(invoiceOf(ctx.store, 1).number).toBe('INV-0001');
  });

  it('is safe to retry after a crash between the post and the write: one entry, same number', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    // The post landed in the book, but the process died before the workspace write: replay that half.
    await ctx.port.post({ bookId: 'book-1', entry: { date: '2026-11-12', description: 'x', lines: [], source: { app: 'startup', kind: 'invoice', ref: u(41) } } } as unknown as LedgerPostRequest, { kind: 'invoice', ref: u(41) });
    expect((await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).ok).toBe(true);
    expect(ctx.posted).toHaveLength(1);
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ status: 'issued', number: 'INV-0001', entries: { issued: ctx.posted[0]?.entryId } });
  });

  it('refuses an issued invoice a second time and refuses edits to it', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    expect(await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await ctx.run({ op: 'upsertInvoice', invoice: draft(1) })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(ctx.posted).toHaveLength(1);
  });

  it('never lets a caller choose the number or the entries of a draft', async () => {
    const ctx = await setup();
    await ctx.run({ op: 'upsertInvoice', invoice: { ...draft(1), number: 'INV-9999', entries: { issued: u(5) } } });
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ number: null, entries: {} });
  });
});

describe('markPaid and voidInvoice', () => {
  it('pays: Dr bank / Cr receivable for the total', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    expect(await ctx.run({ op: 'markPaid', id: u(41), paidDate: '2026-11-20' })).toMatchObject({ ok: false, kind: 'invalid' }); // still a draft
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    expect(await ctx.run({ op: 'markPaid', id: u(41), paidDate: '2026-11-01' })).toMatchObject({ ok: false, kind: 'invalid' }); // before issue
    expect((await ctx.run({ op: 'markPaid', id: u(41), paidDate: '2026-11-20' })).ok).toBe(true);
    expect(ctx.posted[1]?.source).toEqual({ kind: 'payment', ref: u(41) });
    expect(ctx.posted[1]?.req.entry.lines.map((l) => [l.accountId, l.side, l.minor])).toEqual([
      [ACCOUNTS.bank, 'debit', 14400],
      [ACCOUNTS.receivable, 'credit', 14400],
    ]);
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ status: 'paid', paidDate: '2026-11-20' });
  });

  it('voids an unpaid invoice with one reversal and keeps its number', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    expect(await ctx.run({ op: 'voidInvoice', id: u(41), reason: '  ' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect((await ctx.run({ op: 'voidInvoice', id: u(41), reason: 'Wrong customer' })).ok).toBe(true);
    expect(ctx.reversed).toHaveLength(1);
    expect(ctx.reversed[0]?.entryId).toBe(ctx.posted[0]?.entryId);
    expect(invoiceOf(ctx.store, 1)).toMatchObject({ status: 'void', number: 'INV-0001', voidReason: 'Wrong customer' });
    // The next invoice does not reuse the voided number.
    await ctx.run({ op: 'upsertInvoice', invoice: draft(2) });
    await ctx.run({ op: 'issueInvoice', id: u(42), issueDate: '2026-11-13' });
    expect(invoiceOf(ctx.store, 2).number).toBe('INV-0002');
  });

  it('cannot void a paid invoice', async () => {
    const ctx = await setup();
    await linked(ctx);
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    await ctx.run({ op: 'issueInvoice', id: u(41), issueDate: '2026-11-12' });
    await ctx.run({ op: 'markPaid', id: u(41), paidDate: '2026-11-20' });
    expect(await ctx.run({ op: 'voidInvoice', id: u(41), reason: 'oops' })).toMatchObject({ ok: false, kind: 'invalid', message: 'Refunds are not supported yet.' });
    expect(ctx.reversed).toHaveLength(0);
  });
});

describe('ledgerSummary and the projection', () => {
  it('reports the book cash and the mean of the last three full months of burn', async () => {
    const ctx = await setup(
      memoryPort({
        cashBalance: async () => ({ ok: true, value: { minor: 500000 } }),
        monthlyNet: async (_b, from, to) => ({
          ok: true,
          value: from === '2026-08-01' && to === '2026-10-31'
            ? [
                { month: '2026-08', incomeMinor: 0, expenseMinor: 100000 },
                { month: '2026-09', incomeMinor: 20000, expenseMinor: 100000 },
                { month: '2026-10', incomeMinor: 40000, expenseMinor: 100000 },
              ]
            : [],
        }),
      }),
    );
    expect(await ctx.run({ op: 'ledgerSummary' })).toMatchObject({ ok: false, kind: 'no-book' });
    await linked(ctx);
    expect(await ctx.run({ op: 'ledgerSummary' })).toEqual({ ok: true, value: { bookName: 'book-1', cashMinor: 500000, asOf: '2026-11-12', actualBurnMinor: 80000 } });
  });

  it('opens the projection from the book cash when one is linked', async () => {
    const ctx = await setup(memoryPort({ cashBalance: async () => ({ ok: true, value: { minor: 700000 } }) }));
    await linked(ctx);
    const r = await ctx.run({ op: 'projection', scenarioId: '00000000-0000-4000-8000-000000000001', months: 12 });
    expect(r.ok && (r.value as { months: { cashMinor: number }[] }).months[0]?.cashMinor).toBe(700000);
  });
});

describe('exportInvoicePdf', () => {
  it('prints and saves, and treats a cancelled dialog as not saved', async () => {
    const ctx = await setup();
    await ctx.run({ op: 'upsertInvoice', invoice: draft(1) });
    const out = await mkdtemp(join(tmpdir(), 'startup-pdf-'));
    const target = join(out, 'a.pdf');
    let printed = '';
    const pdf = { printToPdf: async (file: string) => ((printed = file), Buffer.from('%PDF-1.4')), savePdf: async () => target };
    expect(await ctx.run({ op: 'exportInvoicePdf', id: u(41) }, pdf as never)).toEqual({ ok: true, value: { saved: true } });
    expect(printed.endsWith('invoice.html')).toBe(true);
    const cancelled = { printToPdf: async () => Buffer.from(''), savePdf: async () => null };
    expect(await ctx.run({ op: 'exportInvoicePdf', id: u(41) }, cancelled as never)).toEqual({ ok: true, value: { saved: false } });
  });
});
