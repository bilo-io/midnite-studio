// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LedgerAccount } from '@midnite/studio-shared';

import { createLedgerService, type LedgerService } from './ledger-service';
import { csvCell, decimalOf, exportReport, reportToCsv, runReport } from './reports';

const open: LedgerService[] = [];
afterEach(async () => {
  while (open.length) await open.pop()?.dispose();
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-reports-'));
  const service = createLedgerService({ root: join(dir, 'books'), appId: 'money', now: () => new Date('2026-06-01T00:00:00Z') });
  open.push(service);
  const made = await service.createBook({ name: 'Acme Studio', entity: 'sole-trader', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: 'sole-trader' });
  if (!made.ok) throw new Error(made.message);
  const book = made.value.book;
  const acct = (name: string): LedgerAccount => book.accounts.find((a) => a.name === name) as LedgerAccount;
  const post = (date: string, debit: string, credit: string, minor: number) =>
    service.post(
      { bookId: book.id, entry: { date, description: 'x', lines: [{ accountId: acct(debit).id, side: 'debit', minor }, { accountId: acct(credit).id, side: 'credit', minor }], source: { app: 'money', kind: 'manual' } } },
      { app: 'money', kind: 'manual' },
    );
  await post('2026-05-01', 'Bank', 'Sales', 123_456);
  return { service, dir, book, acct };
}

describe('report ops', () => {
  it('builds a report from the stored journal', async () => {
    const { service, book } = await setup();
    const r = await runReport(service, { bookId: book.id, kind: 'profit-and-loss', from: '2026-04-06', to: '2027-04-05' });
    expect(r).toMatchObject({ ok: true, value: { kind: 'profit-and-loss', netProfit: 123_456, currency: 'GBP' } });
  });

  it('answers invalid for a backwards range and not-found for an unknown book', async () => {
    const { service, book } = await setup();
    expect(await runReport(service, { bookId: book.id, kind: 'cash-flow', from: '2027-01-01', to: '2026-01-01' })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await runReport(service, { bookId: '99999999-9999-4999-8999-999999999999', kind: 'cash-flow', from: '2026-01-01', to: '2026-12-31' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('exports CSV with exact decimal strings to the chosen path, and cancel saves nothing', async () => {
    const { service, book, dir } = await setup();
    const target = join(dir, 'out.csv');
    let offered = '';
    const saved = await exportReport(service, { bookId: book.id, kind: 'trial-balance', from: '2026-04-06', to: '2027-04-05' }, async (name) => ((offered = name), target));
    expect(saved).toEqual({ ok: true, value: { path: target } });
    expect(offered).toBe('acme-studio-trial-balance-2026-04-06-2027-04-05.csv');
    const text = await readFile(target, 'utf8');
    expect(text).toContain('Code,Account,Debit,Credit');
    expect(text).toMatch(/^\d+,Bank,1234\.56,0\.00$/m);
    expect(text).toContain(',Total,1234.56,1234.56');
    expect(await exportReport(service, { bookId: book.id, kind: 'trial-balance', from: '2026-04-06', to: '2027-04-05' }, async () => null)).toEqual({ ok: true, value: { path: null } });
  });
});

describe('csv helpers', () => {
  it('formats minor units as decimal strings with no float', () => {
    expect(decimalOf(123_456, 'GBP')).toBe('1234.56');
    expect(decimalOf(-5, 'GBP')).toBe('-0.05');
    expect(decimalOf(1500, 'JPY')).toBe('1500');
    expect(decimalOf(1234, 'KWD')).toBe('1.234');
    expect(decimalOf(9_007_199_254_740_991, 'GBP')).toBe('90071992547409.91');
  });

  it('quotes cells and neutralises a leading formula character, but not a negative number', () => {
    expect(csvCell('Rent, "main"')).toBe('"Rent, ""main"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-12.50')).toBe('-12.50');
  });

  it('writes every report kind', () => {
    const base = { currency: 'GBP' } as const;
    const row = { accountId: null, code: '', name: 'Line', minor: 100 };
    expect(reportToCsv({ ...base, kind: 'cash-flow', from: 'a', to: 'b', netProfit: 1, operating: [row], operatingTotal: 1, investing: [], investingTotal: 0, financing: [], financingTotal: 0, netChange: 1, openingCash: 0, closingCash: 1, unreconciled: 0 })).toContain('Unreconciled,,,0.00');
    expect(reportToCsv({ ...base, kind: 'balance-sheet', asOf: 'a', assets: [row], assetsTotal: 100, liabilities: [], liabilitiesTotal: 0, equity: [row], equityTotal: 100, difference: 0 })).toContain('Difference');
    expect(reportToCsv({ ...base, kind: 'profit-and-loss', from: 'a', to: 'b', income: [row], incomeTotal: 100, costOfSales: [], costOfSalesTotal: 0, grossProfit: 100, expenses: [], expensesTotal: 0, netProfit: 100 })).toContain('Net profit');
  });
});
