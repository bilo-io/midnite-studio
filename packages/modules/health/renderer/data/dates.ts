/**
 * A local calendar date as `YYYY-MM-DD`, from the local getters. Never `toISOString()`: that is UTC and files
 * a 23:30 dinner in Johannesburg under tomorrow.
 */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM` of a `YYYY-MM-DD` key. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The month key `n` months from `d`'s month (negative for earlier). */
export function monthKeyOffset(d: Date, n: number): string {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return localDateKey(t).slice(0, 7);
}
