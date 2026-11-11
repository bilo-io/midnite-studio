import type { Contract } from './startup';

export type ContractStatus = 'active' | 'notice-due' | 'ending' | 'ended';

/** Days inside which a notice deadline or a final end date is flagged. */
export const WARNING_DAYS = 30;

const parse = (date: string): Date => new Date(`${date}T00:00:00Z`);
const format = (date: Date): string => date.toISOString().slice(0, 10);

/** `date` plus whole months, clamping the day to the target month's length (31 Jan + 1 month is 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const d = parse(date);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay))));
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * 86_400_000));
}

export const daysBetween = (from: string, to: string): number => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

/**
 * When the current term ends. A term is `start` to `end` (the last day, inclusive); an auto-renewing contract rolls
 * forward by `renewalTermMonths` until the term end is on or after `today`. No `end` means open-ended, `null`.
 */
export function currentTermEnd(c: Contract, today: string): string | null {
  if (c.end === undefined) return null;
  if (!c.autoRenews || c.renewalTermMonths === undefined) return c.end;
  let end = c.end;
  // Terms are whole months from the first end; recomputing from the original end avoids day-clamp drift.
  for (let n = 1; end < today && n <= 1200; n += 1) end = addDays(addMonths(addDays(c.end, 1), n * c.renewalTermMonths), -1);
  return end;
}

/** The last day to give notice: the current term's end minus `noticeDays`. */
export function noticeDeadline(c: Contract, today: string): string | null {
  const end = currentTermEnd(c, today);
  return end === null ? null : addDays(end, -c.noticeDays);
}

/**
 * `notice-due`: an auto-renewing contract whose notice deadline is within 30 days (or passed this term);
 * `ending`: a non-renewing one whose end is within 30 days; `ended`: non-renewing and past its end.
 */
export function contractStatus(c: Contract, today: string): ContractStatus {
  if (c.end === undefined) return 'active';
  if (c.autoRenews && c.renewalTermMonths !== undefined) {
    const deadline = noticeDeadline(c, today);
    return deadline !== null && daysBetween(today, deadline) <= WARNING_DAYS ? 'notice-due' : 'active';
  }
  if (c.end < today) return 'ended';
  return daysBetween(today, c.end) <= WARNING_DAYS ? 'ending' : 'active';
}
