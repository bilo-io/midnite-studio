import { normalSide, type LedgerAccount } from '@midnite/studio-shared';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today as `YYYY-MM-DD` in local time. */
export const todayIso = (now: Date = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The latest fiscal-year start on or before `onDate` (a day past the month's end clamps to its last day). */
export function fiscalYearStart(start: { month: number; day: number }, onDate: string): string {
  const year = Number(onDate.slice(0, 4));
  const at = (y: number): string => `${y}-${pad(start.month)}-${pad(Math.min(start.day, daysIn(y, start.month)))}`;
  return at(year) <= onDate ? at(year) : at(year - 1);
}

export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

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
