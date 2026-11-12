/**
 * The four standard reports (Phase 129 Theme F), computed from a book and its journal.
 *
 * Pure functions, no I/O: main serves them over the `report` op, and the in-memory ledger the renderer's tests
 * and shots use calls the very same code. Every figure is an integer number of minor units; the sums run in
 * `BigInt` and come back as `number` only after a safe-integer check, so a long journal cannot drift.
 *
 * Imports `./ledger` only: this is the wire contract.
 */
import { normalSide, type AccountSubtype, type JournalEntry, type LedgerAccount, type LedgerBook, type LedgerReportKind } from './ledger';

/** One line of a report; `accountId` is null for a computed line (retained earnings, a cash-flow movement). */
export type ReportRow = { accountId: string | null; code: string; name: string; minor: number };
export type TrialBalanceRow = { accountId: string; code: string; name: string; debit: number; credit: number };

export type TrialBalanceReport = {
  kind: 'trial-balance';
  currency: string;
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
};

export type ProfitAndLossReport = {
  kind: 'profit-and-loss';
  currency: string;
  from: string;
  to: string;
  income: ReportRow[];
  incomeTotal: number;
  costOfSales: ReportRow[];
  costOfSalesTotal: number;
  grossProfit: number;
  expenses: ReportRow[];
  expensesTotal: number;
  netProfit: number;
};

export type BalanceSheetReport = {
  kind: 'balance-sheet';
  currency: string;
  asOf: string;
  assets: ReportRow[];
  assetsTotal: number;
  liabilities: ReportRow[];
  liabilitiesTotal: number;
  /** Equity accounts plus the two computed lines: retained earnings and profit this year. */
  equity: ReportRow[];
  equityTotal: number;
  /** Assets − liabilities − equity. Zero for any balanced journal; shown, never hidden, when it is not. */
  difference: number;
};

export type CashFlowReport = {
  kind: 'cash-flow';
  currency: string;
  from: string;
  to: string;
  netProfit: number;
  /** Working-capital movements (net profit comes first in the view, then these). */
  operating: ReportRow[];
  operatingTotal: number;
  investing: ReportRow[];
  investingTotal: number;
  financing: ReportRow[];
  financingTotal: number;
  /** Operating + investing + financing, with net profit inside operating. */
  netChange: number;
  openingCash: number;
  closingCash: number;
  /** The journal's real change in cash and bank minus `netChange`; zero when the statement reconciles. */
  unreconciled: number;
};

export type LedgerReport = TrialBalanceReport | ProfitAndLossReport | BalanceSheetReport | CashFlowReport;

export class ReportRangeError extends Error {}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const toMinor = (v: bigint): number => {
  if (v > SAFE || v < -SAFE) throw new ReportRangeError('A total is too large to report exactly.');
  return Number(v);
};

type Side = { d: bigint; c: bigint };
type Totals = Map<string, Side>;

/** Debit and credit sums per account over entries dated within `[from, to]` (either bound optional). */
function totalsOf(entries: readonly JournalEntry[], from: string | null, to: string | null): Totals {
  const out: Totals = new Map();
  for (const e of entries) {
    if (from !== null && e.date < from) continue;
    if (to !== null && e.date > to) continue;
    for (const l of e.lines) {
      const t = out.get(l.accountId) ?? { d: 0n, c: 0n };
      if (l.side === 'debit') t.d += BigInt(l.minor);
      else t.c += BigInt(l.minor);
      out.set(l.accountId, t);
    }
  }
  return out;
}

const naturalOf = (a: LedgerAccount, t: Side | undefined): bigint => (t ? (normalSide(a.type) === 'debit' ? t.d - t.c : t.c - t.d) : 0n);
const creditOf = (t: Side | undefined): bigint => (t ? t.c - t.d : 0n);
const byCode = (a: LedgerAccount, b: LedgerAccount): number => a.code.localeCompare(b.code) || a.name.localeCompare(b.name);
const sum = (xs: readonly bigint[]): bigint => xs.reduce((a, b) => a + b, 0n);

const pad = (n: number): string => String(n).padStart(2, '0');
const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The latest fiscal-year start on or before `onDate` (a day past the month's end clamps to its last day). */
export function fiscalYearStartOn(start: { month: number; day: number }, onDate: string): string {
  const year = Number(onDate.slice(0, 4));
  const at = (y: number): string => `${y}-${pad(start.month)}-${pad(Math.min(start.day, daysIn(y, start.month)))}`;
  return at(year) <= onDate ? at(year) : at(year - 1);
}

export function isoDayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type Rows = { rows: ReportRow[]; total: bigint };
function rowsOf(accounts: readonly LedgerAccount[], totals: Totals, pick: (a: LedgerAccount) => boolean): Rows {
  const picked = accounts.filter(pick).sort(byCode);
  const withBalance = picked.map((a) => ({ a, v: naturalOf(a, totals.get(a.id)) })).filter((x) => x.v !== 0n);
  return { rows: withBalance.map(({ a, v }) => ({ accountId: a.id, code: a.code, name: a.name, minor: toMinor(v) })), total: sum(withBalance.map((x) => x.v)) };
}

/** Income minus expense over `totals`. */
const profitOf = (accounts: readonly LedgerAccount[], totals: Totals): bigint =>
  sum(accounts.map((a) => (a.type === 'income' ? naturalOf(a, totals.get(a.id)) : a.type === 'expense' ? -naturalOf(a, totals.get(a.id)) : 0n)));

export function trialBalance(book: LedgerBook, entries: readonly JournalEntry[], asOf: string): TrialBalanceReport {
  const totals = totalsOf(entries, null, asOf);
  const rows: TrialBalanceRow[] = [];
  let debit = 0n;
  let credit = 0n;
  for (const a of [...book.accounts].sort(byCode)) {
    const t = totals.get(a.id);
    const net = t ? t.d - t.c : 0n;
    if (net === 0n) continue;
    const d = net > 0n ? net : 0n;
    const c = net < 0n ? -net : 0n;
    debit += d;
    credit += c;
    rows.push({ accountId: a.id, code: a.code, name: a.name, debit: toMinor(d), credit: toMinor(c) });
  }
  return { kind: 'trial-balance', currency: book.currency, asOf, rows, totalDebit: toMinor(debit), totalCredit: toMinor(credit) };
}

export function profitAndLoss(book: LedgerBook, entries: readonly JournalEntry[], from: string, to: string): ProfitAndLossReport {
  if (from > to) throw new ReportRangeError('The start date is after the end date.');
  const totals = totalsOf(entries, from, to);
  const income = rowsOf(book.accounts, totals, (a) => a.type === 'income');
  const cos = rowsOf(book.accounts, totals, (a) => a.subtype === 'cost-of-sales');
  const expenses = rowsOf(book.accounts, totals, (a) => a.type === 'expense' && a.subtype !== 'cost-of-sales');
  const gross = income.total - cos.total;
  return {
    kind: 'profit-and-loss',
    currency: book.currency,
    from,
    to,
    income: income.rows,
    incomeTotal: toMinor(income.total),
    costOfSales: cos.rows,
    costOfSalesTotal: toMinor(cos.total),
    grossProfit: toMinor(gross),
    expenses: expenses.rows,
    expensesTotal: toMinor(expenses.total),
    netProfit: toMinor(gross - expenses.total),
  };
}

export function balanceSheet(book: LedgerBook, entries: readonly JournalEntry[], asOf: string): BalanceSheetReport {
  const totals = totalsOf(entries, null, asOf);
  const yearStart = fiscalYearStartOn(book.fiscalYearStart, asOf);
  const priorProfit = profitOf(book.accounts, totalsOf(entries, null, isoDayBefore(yearStart)));
  const thisYear = profitOf(book.accounts, totalsOf(entries, yearStart, asOf));
  const assets = rowsOf(book.accounts, totals, (a) => a.type === 'asset');
  const liabilities = rowsOf(book.accounts, totals, (a) => a.type === 'liability');
  const equity = rowsOf(book.accounts, totals, (a) => a.type === 'equity' && a.subtype !== 'retained-earnings');
  // Retained earnings: whatever was posted to a retained-earnings account, plus every earlier year's profit.
  const posted = sum(book.accounts.filter((a) => a.subtype === 'retained-earnings').map((a) => naturalOf(a, totals.get(a.id))));
  const retained = posted + priorProfit;
  const equityRows: ReportRow[] = [
    ...equity.rows,
    { accountId: null, code: '', name: 'Retained earnings', minor: toMinor(retained) },
    { accountId: null, code: '', name: 'Profit this year', minor: toMinor(thisYear) },
  ];
  const equityTotal = equity.total + retained + thisYear;
  return {
    kind: 'balance-sheet',
    currency: book.currency,
    asOf,
    assets: assets.rows,
    assetsTotal: toMinor(assets.total),
    liabilities: liabilities.rows,
    liabilitiesTotal: toMinor(liabilities.total),
    equity: equityRows,
    equityTotal: toMinor(equityTotal),
    difference: toMinor(assets.total - liabilities.total - equityTotal),
  };
}

const MOVEMENT_LABEL: Partial<Record<AccountSubtype, string>> = {
  receivable: 'Change in receivables',
  'current-asset': 'Change in other current assets',
  payable: 'Change in payables',
  'tax-payable': 'Change in tax payable',
  'current-liability': 'Change in other current liabilities',
  'fixed-asset': 'Purchase of fixed assets',
  loan: 'Loans received less repaid',
  'owner-equity': 'Owner capital introduced',
  'share-capital': 'Share capital issued',
  drawings: 'Drawings',
  'retained-earnings': 'Retained earnings adjustments',
};

const OPERATING: readonly AccountSubtype[] = ['receivable', 'current-asset', 'payable', 'tax-payable', 'current-liability'];
const INVESTING: readonly AccountSubtype[] = ['fixed-asset'];
const FINANCING: readonly AccountSubtype[] = ['loan', 'owner-equity', 'share-capital', 'drawings', 'retained-earnings'];

/** Cash flow, indirect: net profit, then each balance-sheet account's movement (credit minus debit) by subtype. */
export function cashFlow(book: LedgerBook, entries: readonly JournalEntry[], from: string, to: string): CashFlowReport {
  if (from > to) throw new ReportRangeError('The start date is after the end date.');
  const opening = totalsOf(entries, null, isoDayBefore(from));
  const closing = totalsOf(entries, null, to);
  const period = totalsOf(entries, from, to);
  const netProfit = profitOf(book.accounts, period);

  const movement = (subtypes: readonly AccountSubtype[]): { rows: ReportRow[]; total: bigint } => {
    const rows: ReportRow[] = [];
    let total = 0n;
    for (const subtype of subtypes) {
      const accounts = book.accounts.filter((a) => a.subtype === subtype);
      // Credit minus debit: an asset that grew used cash (negative); a liability or equity that grew supplied it.
      const delta = sum(accounts.map((a) => creditOf(closing.get(a.id)) - creditOf(opening.get(a.id))));
      if (delta === 0n) continue;
      total += delta;
      rows.push({ accountId: null, code: '', name: MOVEMENT_LABEL[subtype] ?? subtype, minor: toMinor(delta) });
    }
    return { rows, total };
  };
  const operating = movement(OPERATING);
  const investing = movement(INVESTING);
  const financing = movement(FINANCING);
  const cashAccounts = book.accounts.filter((a) => a.subtype === 'cash' || a.subtype === 'bank');
  const cashAt = (t: Totals): bigint => sum(cashAccounts.map((a) => naturalOf(a, t.get(a.id))));
  const openingCash = cashAt(opening);
  const closingCash = cashAt(closing);
  const operatingTotal = netProfit + operating.total;
  const netChange = operatingTotal + investing.total + financing.total;
  return {
    kind: 'cash-flow',
    currency: book.currency,
    from,
    to,
    netProfit: toMinor(netProfit),
    operating: operating.rows,
    operatingTotal: toMinor(operatingTotal),
    investing: investing.rows,
    investingTotal: toMinor(investing.total),
    financing: financing.rows,
    financingTotal: toMinor(financing.total),
    netChange: toMinor(netChange),
    openingCash: toMinor(openingCash),
    closingCash: toMinor(closingCash),
    unreconciled: toMinor(closingCash - openingCash - netChange),
  };
}

/** Routes a `report` request to its function. A trial balance and a balance sheet are as of `to`. */
export function buildReport(kind: LedgerReportKind, book: LedgerBook, entries: readonly JournalEntry[], from: string, to: string): LedgerReport {
  switch (kind) {
    case 'trial-balance':
      return trialBalance(book, entries, to);
    case 'balance-sheet':
      return balanceSheet(book, entries, to);
    case 'profit-and-loss':
      return profitAndLoss(book, entries, from, to);
    case 'cash-flow':
      return cashFlow(book, entries, from, to);
  }
}
