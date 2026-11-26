// SAST (Africa/Johannesburg, UTC+2, no DST) date-window math for the report scripts (Phase 151 Theme C).
// Everything is derived from a UTC instant + a constant 7200 s, so it never depends on the host's TZ.
export const SAST_OFFSET_S = 7200;
const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseYmd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return ymdOf(d) === s ? d : null; // rejects 2026-02-31
};

/** The SAST calendar date (`YYYY-MM-DD`) of an instant. */
export const sastDate = (now = new Date()) => ymdOf(new Date(now.getTime() + SAST_OFFSET_S * 1000));
/** `HH:MM` in SAST of a UTC ISO string (`2026-11-17T16:19:00Z` -> `18:19`). */
export function utcToSastHM(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '--:--';
  const d = new Date(t + SAST_OFFSET_S * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function addDays(ymd, n) {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
}
/** Calendar-month subtraction clamped to the month's last day (`2026-03-31` -1m -> `2026-02-28`). */
export function addMonths(ymd, n) {
  const d = parseYmd(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return ymdOf(d);
}
const weekdayMon0 = (ymd) => (parseYmd(ymd).getUTCDay() + 6) % 7; // Monday = 0

/**
 * Resolve `today | yesterday | YYYY-MM-DD | this-week | this-month | START..END` to an inclusive SAST
 * window. Throws on anything else (or START after END).
 * @returns {{start:string, end:string, spec:string, singleDay:boolean, search:string}}
 */
export function resolveWindow(spec = 'today', now = new Date()) {
  const today = sastDate(now);
  let start;
  let end = today;
  const s = String(spec).trim();
  if (s === 'today') start = today;
  else if (s === 'yesterday') start = end = addDays(today, -1);
  else if (s === 'this-week') start = addDays(today, -weekdayMon0(today));
  else if (s === 'this-month') start = `${today.slice(0, 8)}01`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) start = end = s;
  else if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(s)) [start, end] = s.split('..');
  else throw new Error(`unknown window "${spec}" (today | yesterday | YYYY-MM-DD | this-week | this-month | START..END)`);
  if (!parseYmd(start) || !parseYmd(end)) throw new Error(`invalid date in window "${spec}"`);
  if (start > end) throw new Error(`window start ${start} is after end ${end}`);
  return { start, end, spec: s, singleDay: start === end, search: searchRange(start, end) };
}

/** GitHub search range pinned to the SAST day (a bare date would bucket by the UTC day). */
export const searchRange = (start, end) => `${start}T00:00:00+02:00..${end}T23:59:59+02:00`;

/** Retro windows: `1m | 3m | 6m | 1y` ending today (SAST). */
export function retroWindow(span = '1m', now = new Date()) {
  const end = sastDate(now);
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[span];
  if (!months) throw new Error(`unknown window "${span}" (1m | 3m | 6m | 1y)`);
  return { start: addMonths(end, -months), end, span };
}

/** The final-report rule: a complete-day window, or today once it is 22:00 SAST or later. */
export function wantsPdf(win, now = new Date()) {
  if (win.end < sastDate(now)) return true;
  const hour = new Date(now.getTime() + SAST_OFFSET_S * 1000).getUTCHours();
  return win.end === sastDate(now) && hour >= 22;
}
