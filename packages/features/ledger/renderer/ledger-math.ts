import { fiscalYearStartOn, isoDayBefore, normalSide, type LedgerAccount } from '@midnite/studio-shared';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today as `YYYY-MM-DD` in local time. */
export const todayIso = (now: Date = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The latest fiscal-year start on or before `onDate`; the one definition lives with the report maths in `shared`. */
export const fiscalYearStart = fiscalYearStartOn;
export const dayBefore = isoDayBefore;

export const dayAfter = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export type RawBalance = { accountId: string; debit: number; credit: number };

/** An account's balance with its normal side positive. */
export function accountBalance(account: LedgerAccount, raw: { debit: number; credit: number } | undefined): number {
  if (!raw) return 0;
  return normalSide(account.type) === 'debit' ? raw.debit - raw.credit : raw.credit - raw.debit;
}

export function balanceMap(rows: readonly RawBalance[]): Map<string, RawBalance> {
  return new Map(rows.map((r) => [r.accountId, r]));
}

export function sumBySubtype(accounts: readonly LedgerAccount[], rows: Map<string, RawBalance>, subtypes: readonly string[]): number {
  return accounts.filter((a) => subtypes.includes(a.subtype)).reduce((t, a) => t + accountBalance(a, rows.get(a.id)), 0);
}

/** Income minus expense from a balance set. */
export function profitOf(accounts: readonly LedgerAccount[], rows: Map<string, RawBalance>): number {
  return accounts.reduce((t, a) => (a.type === 'income' ? t + accountBalance(a, rows.get(a.id)) : a.type === 'expense' ? t - accountBalance(a, rows.get(a.id)) : t), 0);
}

export const REPORT_RANGES = [
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'fiscal-year', label: 'Fiscal year to date' },
  { id: 'last-fiscal-year', label: 'Last fiscal year' },
  { id: 'custom', label: 'Custom' },
] as const;

const monthEnd = (year: number, month: number): string => `${year}-${pad(month)}-${pad(daysIn(year, month))}`;

/** The `from`/`to` a preset means on `today`; `custom` has no preset range (null). */
export function presetRange(preset: string, today: string, fiscalStart: { month: number; day: number }): { from: string; to: string } | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (preset) {
    case 'month':
      return { from: `${year}-${pad(month)}-01`, to: monthEnd(year, month) };
    case 'last-month': {
      const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
      return { from: `${y}-${pad(m)}-01`, to: monthEnd(y, m) };
    }
    case 'quarter': {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: `${year}-${pad(first)}-01`, to: monthEnd(year, first + 2) };
    }
    case 'fiscal-year':
      return { from: fiscalYearStart(fiscalStart, today), to: today };
    case 'last-fiscal-year': {
      const start = fiscalYearStart(fiscalStart, today);
      return { from: fiscalYearStart(fiscalStart, dayBefore(start)), to: dayBefore(start) };
    }
    default:
      return null;
  }
}
