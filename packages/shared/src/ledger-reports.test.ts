import { describe, expect, it } from 'vitest';

import { ACCOUNT_SUBTYPES, SUBTYPES_BY_TYPE, type AccountType, type JournalEntry, type LedgerAccount, type LedgerBook } from './ledger';
import { ReportRangeError, balanceSheet, buildReport, cashFlow, fiscalYearStartOn, profitAndLoss, trialBalance } from './ledger-reports';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Spec = [code: string, name: string, type: AccountType, subtype: LedgerAccount['subtype']];
const SPECS: Spec[] = [
  ['1000', 'Bank', 'asset', 'bank'],
  ['1100', 'Receivables', 'asset', 'receivable'],
  ['1500', 'Equipment', 'asset', 'fixed-asset'],
  ['2000', 'Payables', 'liability', 'payable'],
  ['2500', 'Loan', 'liability', 'loan'],
  ['3000', 'Capital', 'equity', 'owner-equity'],
  ['3100', 'Drawings', 'equity', 'drawings'],
  ['4000', 'Sales', 'income', 'sales'],
  ['5000', 'Materials', 'expense', 'cost-of-sales'],
  ['6000', 'Rent', 'expense', 'operating-expense'],
  ['6100', 'Software', 'expense', 'operating-expense'],
];
const bookOf = (specs: Spec[]): LedgerBook => ({
  version: 1,
  id: uuid(900),
  name: 'Fixture',
  entity: 'sole-trader',
  currency: 'GBP',
  fiscalYearStart: { month: 4, day: 6 },
  lockedThrough: null,
  jurisdiction: null,
  accounts: specs.map(([code, name, type, subtype], i) => ({ id: uuid(i + 1), code, name, type, subtype, archived: false, taxTreatment: 'none' })),
  rules: [],
  createdAt: '2025-04-06T00:00:00.000Z',
});

const book = bookOf(SPECS);
const id = (name: string): string => (book.accounts.find((a) => a.name === name) as LedgerAccount).id;
let seq = 0;
const entry = (date: string, debit: string, credit: string, minor: number): JournalEntry => ({
  id: uuid(1000 + ++seq),
  date,
  description: `${debit} / ${credit}`,
  lines: [
    { accountId: id(debit), side: 'debit', minor },
    { accountId: id(credit), side: 'credit', minor },
  ],
  source: { app: 'money', kind: 'manual' },
  postedAt: `${date}T09:00:00.000Z`,
});

// A hand-worked sole-trader year (UK fiscal year 6 April to 5 April), amounts in pence.
const YEAR: JournalEntry[] = [
  entry('2025-04-10', 'Bank', 'Capital', 1_000_000),
  entry('2025-04-15', 'Equipment', 'Bank', 120_000),
  entry('2025-05-01', 'Bank', 'Loan', 500_000),
  entry('2025-06-01', 'Receivables', 'Sales', 600_000),
  entry('2025-06-20', 'Bank', 'Receivables', 400_000),
  entry('2025-07-03', 'Bank', 'Sales', 150_000),
  entry('2025-07-10', 'Materials', 'Payables', 80_000),
  entry('2025-08-01', 'Payables', 'Bank', 50_000),
  entry('2025-09-01', 'Rent', 'Bank', 90_000),
  entry('2025-10-01', 'Software', 'Bank', 12_000),
  entry('2025-12-01', 'Drawings', 'Bank', 70_000),
  entry('2026-04-20', 'Bank', 'Sales', 30_000), // the next fiscal year
];

describe('reports: the hand-worked year', () => {
  it('trial balance at the year end has equal totals of 22,800.00', () => {
    const tb = trialBalance(book, YEAR, '2026-04-05');
    expect(tb.totalDebit).toBe(2_280_000);
    expect(tb.totalCredit).toBe(2_280_000);
    expect(tb.rows.find((r) => r.name === 'Bank')).toMatchObject({ debit: 1_708_000, credit: 0 });
    expect(tb.rows.find((r) => r.name === 'Sales')).toMatchObject({ debit: 0, credit: 750_000 });
  });

  it('profit and loss: sales 7,500, gross 6,700, expenses 1,020, net 5,680', () => {
    const pl = profitAndLoss(book, YEAR, '2025-04-06', '2026-04-05');
    expect(pl).toMatchObject({ incomeTotal: 750_000, costOfSalesTotal: 80_000, grossProfit: 670_000, expensesTotal: 102_000, netProfit: 568_000 });
    expect(pl.expenses.map((r) => r.name)).toEqual(['Rent', 'Software']);
  });

  it('a profit and loss over a range outside the year is empty', () => {
    expect(profitAndLoss(book, YEAR, '2024-04-06', '2025-04-05')).toMatchObject({ incomeTotal: 0, netProfit: 0, income: [] });
  });

  it('balance sheet at the year end balances with profit this year 5,680', () => {
    const bs = balanceSheet(book, YEAR, '2026-04-05');
    expect(bs).toMatchObject({ assetsTotal: 2_028_000, liabilitiesTotal: 530_000, equityTotal: 1_498_000, difference: 0 });
    expect(bs.equity.find((r) => r.name === 'Profit this year')?.minor).toBe(568_000);
    expect(bs.equity.find((r) => r.name === 'Retained earnings')?.minor).toBe(0);
    expect(bs.equity.find((r) => r.name === 'Drawings')?.minor).toBe(-70_000);
  });

  it('the next fiscal year moves last year into retained earnings', () => {
    const bs = balanceSheet(book, YEAR, '2026-05-01');
    expect(bs.equity.find((r) => r.name === 'Retained earnings')?.minor).toBe(568_000);
    expect(bs.equity.find((r) => r.name === 'Profit this year')?.minor).toBe(30_000);
    expect(bs).toMatchObject({ assetsTotal: 2_058_000, equityTotal: 1_528_000, difference: 0 });
  });

  it('cash flow reconciles: operating 3,980, investing -1,200, financing 14,300', () => {
    const cf = cashFlow(book, YEAR, '2025-04-06', '2026-04-05');
    expect(cf).toMatchObject({ netProfit: 568_000, operatingTotal: 398_000, investingTotal: -120_000, financingTotal: 1_430_000, netChange: 1_708_000, openingCash: 0, closingCash: 1_708_000, unreconciled: 0 });
    expect(cf.operating.map((r) => [r.name, r.minor])).toEqual([
      ['Change in receivables', -200_000],
      ['Change in payables', 30_000],
    ]);
  });

  it('a later period starts from the opening balances', () => {
    const cf = cashFlow(book, YEAR, '2026-04-06', '2027-04-05');
    expect(cf).toMatchObject({ openingCash: 1_708_000, closingCash: 1_738_000, netChange: 30_000, unreconciled: 0 });
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => profitAndLoss(book, YEAR, '2026-01-02', '2026-01-01')).toThrow(ReportRangeError);
    expect(() => buildReport('cash-flow', book, YEAR, '2026-01-02', '2026-01-01')).toThrow('start date is after');
  });

  it('sums exactly past 2^32 and refuses a total beyond a safe integer', () => {
    const big = [entry('2025-05-01', 'Bank', 'Capital', 9_000_000_000_000), entry('2025-05-02', 'Bank', 'Capital', 1)];
    expect(trialBalance(book, big, '2025-12-31').totalDebit).toBe(9_000_000_000_001);
    const huge = [entry('2025-05-01', 'Bank', 'Capital', Number.MAX_SAFE_INTEGER), entry('2025-05-02', 'Bank', 'Capital', 5)];
    expect(() => trialBalance(book, huge, '2025-12-31')).toThrow(ReportRangeError);
  });
});

describe('fiscalYearStartOn', () => {
  it('finds the start on or before a date, clamping a missing day', () => {
    expect(fiscalYearStartOn({ month: 4, day: 6 }, '2026-04-05')).toBe('2025-04-06');
    expect(fiscalYearStartOn({ month: 4, day: 6 }, '2026-04-06')).toBe('2026-04-06');
    expect(fiscalYearStartOn({ month: 2, day: 29 }, '2026-12-01')).toBe('2026-02-28');
  });
});

/** A small linear congruential generator, so the property test is deterministic without a dependency. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

describe('reports: 500 random balanced entries', () => {
  const allSpecs: Spec[] = ACCOUNT_SUBTYPES.map((subtype, i) => {
    const type = (Object.keys(SUBTYPES_BY_TYPE) as AccountType[]).find((t) => SUBTYPES_BY_TYPE[t].includes(subtype)) as AccountType;
    return [String(1000 + i * 10), subtype, type, subtype];
  });
  const full = bookOf(allSpecs);

  it('keeps the balance sheet balanced and the cash flow reconciled', () => {
    const rnd = lcg(129);
    const entries: JournalEntry[] = [];
    for (let i = 0; i < 500; i += 1) {
      const day = Math.floor(rnd() * 3 * 365);
      const date = new Date(Date.UTC(2024, 0, 1 + day)).toISOString().slice(0, 10);
      const lineCount = 2 + Math.floor(rnd() * 3);
      const accounts = Array.from({ length: lineCount }, () => (full.accounts[Math.floor(rnd() * full.accounts.length)] as LedgerAccount).id);
      const amounts = Array.from({ length: lineCount - 1 }, () => 1 + Math.floor(rnd() * 5_000_000));
      const lines: JournalEntry['lines'] = [
        ...amounts.map((minor, k) => ({ accountId: accounts[k] as string, side: (rnd() < 0.5 ? 'debit' : 'credit') as 'debit' | 'credit', minor })),
      ];
      const debit = lines.filter((l) => l.side === 'debit').reduce((t, l) => t + l.minor, 0);
      const credit = lines.filter((l) => l.side === 'credit').reduce((t, l) => t + l.minor, 0);
      if (debit !== credit) lines.push({ accountId: accounts[lineCount - 1] as string, side: debit > credit ? 'credit' : 'debit', minor: Math.abs(debit - credit) });
      entries.push({ id: uuid(5000 + i), date, description: `e${i}`, lines, source: { app: 'money', kind: 'manual' }, postedAt: `${date}T00:00:00.000Z` });
    }
    for (let k = 0; k < 20; k += 1) {
      const a = new Date(Date.UTC(2024, 0, 1 + Math.floor(rnd() * 900))).toISOString().slice(0, 10);
      const b = new Date(Date.UTC(2024, 0, 1 + Math.floor(rnd() * 1000))).toISOString().slice(0, 10);
      const [from, to] = a <= b ? [a, b] : [b, a];
      expect(balanceSheet(full, entries, to).difference).toBe(0);
      expect(cashFlow(full, entries, from, to).unreconciled).toBe(0);
      const tb = trialBalance(full, entries, to);
      expect(tb.totalDebit).toBe(tb.totalCredit);
    }
  });
});
