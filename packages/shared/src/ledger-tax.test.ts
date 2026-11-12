import { describe, expect, it } from 'vitest';

import { LedgerBookSchema, type JournalEntry, type LedgerBook } from './ledger';
import { TAX_JURISDICTIONS, buildTaxEstimate, taxYearLabel } from './ledger-tax';

const uk = TAX_JURISDICTIONS['uk-ew-ni'];
const P = (pounds: number): number => Math.round(pounds * 100);
const sole = (profit: number, disallowable = 0, year = '2025-26') => uk.estimate({ taxYear: year, entity: 'sole-trader', profitMinor: P(profit), disallowableMinor: P(disallowable) });
const comp = (profit: number, year = '2025-26') => uk.estimate({ taxYear: year, entity: 'company', profitMinor: P(profit), disallowableMinor: 0 });
const incomeTax = (e: ReturnType<typeof sole>): number => e.lines.filter((l) => l.label.startsWith('Income tax')).reduce((s, l) => s + l.taxMinor, 0);
const class4 = (e: ReturnType<typeof sole>): number => e.lines.filter((l) => l.label.startsWith('Class 4')).reduce((s, l) => s + l.taxMinor, 0);

describe('UK (England, Wales, Northern Ireland)', () => {
  it('sole trader, profit 60 000: income tax 11 432, Class 4 2 456.60, total 13 888.60', () => {
    const e = sole(60_000);
    expect(incomeTax(e)).toBe(P(11_432));
    expect(class4(e)).toBe(P(2_456.6));
    expect(e.totalMinor).toBe(P(13_888.6));
  });

  it('tapers the personal allowance £1 per £2 over 100 000: profit 110 000 leaves 7 570', () => {
    const e = sole(110_000);
    // 110 000 - 7 570 = 102 430 taxable: 37 700 at 20 % + 64 730 at 40 %.
    expect(incomeTax(e)).toBe(P(37_700 * 0.2 + 64_730 * 0.4));
    expect(e.notes[0]).toContain('tapered (7570.00)');
  });

  it('loses the whole allowance at 125 140 and pays the additional rate above it', () => {
    const e = sole(150_000);
    expect(e.lines.find((l) => l.label === 'Income tax, additional rate')?.basisMinor).toBe(P(150_000 - 125_140));
    expect(incomeTax(e)).toBe(P(37_700 * 0.2 + (125_140 - 37_700) * 0.4 + (150_000 - 125_140) * 0.45));
    expect(class4(e)).toBe(P(37_700 * 0.06 + (150_000 - 50_270) * 0.02));
  });

  it('owes nothing at or under the allowance, and nothing on a loss', () => {
    expect(sole(12_570).totalMinor).toBe(0);
    expect(sole(-5_000).totalMinor).toBe(0);
    expect(sole(-5_000).effectiveRateBp).toBe(0);
  });

  it('adds disallowable expenses back before taxing', () => {
    expect(sole(50_000, 10_000).totalMinor).toBe(sole(60_000).totalMinor);
  });

  it('splits payments on account over 31 January and 31 July, summing to the total, only over £1 000', () => {
    const e = sole(60_000);
    expect(e.payments.map((p) => p.due)).toEqual(['2027-01-31', '2027-07-31']);
    expect(e.payments.reduce((s, p) => s + p.minor, 0)).toBe(e.totalMinor);
    expect(sole(14_000).payments).toEqual([]);
  });

  it('company, profit 100 000: 22 750 after 2 250 marginal relief', () => {
    const e = comp(100_000);
    expect(e.totalMinor).toBe(P(22_750));
    expect(e.lines.find((l) => l.label === 'Marginal relief')?.taxMinor).toBe(-P(2_250));
    expect(e.payments[0]).toMatchObject({ due: '2027-01-01', minor: P(22_750) });
  });

  it('company: small profits rate to 50 000, main rate from 250 000, continuous at both limits', () => {
    expect(comp(50_000).totalMinor).toBe(P(9_500));
    expect(comp(250_000).totalMinor).toBe(P(62_500));
    expect(comp(250_000).lines.map((l) => l.label)).toEqual(['Corporation tax, main rate']);
    // 50 000.01 sits on the main rate less relief, within a penny of the small-profits figure.
    expect(Math.abs(uk.estimate({ taxYear: '2025-26', entity: 'company', profitMinor: 5_000_001, disallowableMinor: 0 }).totalMinor - P(9_500))).toBeLessThanOrEqual(1);
    expect(comp(0).totalMinor).toBe(0);
  });

  it('measures a sole trader over 6 April to 5 April and a company over the financial year', () => {
    expect(uk.yearRange('2026-27', 'sole-trader')).toEqual({ from: '2026-04-06', to: '2027-04-05' });
    expect(uk.yearRange('2026-27', 'company')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(taxYearLabel(2099)).toBe('2099-00');
  });

  it('never returns a fractional or unsafe amount', () => {
    for (const profit of [1, 99, 12_345_67, 9_999_999_99]) {
      for (const e of [uk.estimate({ taxYear: '2026-27', entity: 'sole-trader', profitMinor: profit, disallowableMinor: 0 }), uk.estimate({ taxYear: '2026-27', entity: 'company', profitMinor: profit, disallowableMinor: 0 })]) {
        expect(Number.isInteger(e.totalMinor)).toBe(true);
        for (const l of e.lines) expect(Number.isInteger(l.taxMinor)).toBe(true);
      }
    }
  });
});

const ACC = {
  bank: '00000000-0000-4000-8000-000000000001',
  sales: '00000000-0000-4000-8000-000000000002',
  fines: '00000000-0000-4000-8000-000000000003',
};
const book = (over: Partial<LedgerBook> = {}): LedgerBook =>
  LedgerBookSchema.parse({
    version: 1,
    id: '00000000-0000-4000-8000-0000000000b0',
    name: 'Test',
    entity: 'sole-trader',
    currency: 'GBP',
    fiscalYearStart: { month: 4, day: 6 },
    jurisdiction: 'uk-ew-ni',
    accounts: [
      { id: ACC.bank, code: '1000', name: 'Bank', type: 'asset', subtype: 'bank' },
      { id: ACC.sales, code: '4000', name: 'Sales', type: 'income', subtype: 'sales' },
      { id: ACC.fines, code: '6900', name: 'Fines', type: 'expense', subtype: 'other-expense', taxTreatment: 'disallowable' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });
const entry = (date: string, lines: JournalEntry['lines']): JournalEntry =>
  ({ id: crypto.randomUUID(), date, description: 'x', lines, source: { app: 'money', kind: 'manual' }, postedAt: '2026-01-01T00:00:00.000Z' });
const journal = [
  entry('2026-05-01', [{ accountId: ACC.bank, side: 'debit', minor: P(60_000) }, { accountId: ACC.sales, side: 'credit', minor: P(60_000) }]),
  entry('2026-06-01', [{ accountId: ACC.fines, side: 'debit', minor: P(1_000) }, { accountId: ACC.bank, side: 'credit', minor: P(1_000) }]),
  entry('2025-05-01', [{ accountId: ACC.bank, side: 'debit', minor: P(9_000) }, { accountId: ACC.sales, side: 'credit', minor: P(9_000) }]),
];

describe('buildTaxEstimate', () => {
  it('measures the year range, adds disallowable expenses back and carries the fixed notice', () => {
    const r = buildTaxEstimate(book(), journal, 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ taxYear: '2026-27', from: '2026-04-06', to: '2027-04-05', profitMinor: P(59_000), disallowableMinor: P(1_000), taxableProfitMinor: P(60_000) });
    expect(r.value.estimate.totalMinor).toBe(P(13_888.6));
    expect(r.value.disclaimer).toMatch(/^Estimate only — not tax advice\. Based on the United Kingdom .* rules for 2026-27, checked 2026-11-12\./);
  });

  it('refuses without a jurisdiction, for a personal book, in another currency and for an unknown year', () => {
    const kinds = [
      buildTaxEstimate(book({ jurisdiction: null }), journal, 2026),
      buildTaxEstimate(book({ entity: 'personal' }), journal, 2026),
      buildTaxEstimate(book({ currency: 'USD' }), journal, 2026),
      buildTaxEstimate(book(), journal, 2019),
    ];
    for (const r of kinds) expect(r).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
