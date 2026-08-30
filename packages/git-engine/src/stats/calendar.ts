import type { CalendarDay } from '@midnite/studio-shared';

import type { HistoryCommit } from './commit-history';

/**
 * Day-bucketed commit counts, for the contribution heatmap.
 *
 * **Bucketed in the user's local timezone, not UTC.** Git's `%at` is a UTC
 * epoch, and a heatmap cell is a *day in the life of the person reading it*. A
 * commit made at 00:30 on the 6th in Berlin is `22:30 on the 5th` in UTC —
 * bucket it as UTC and the square lights up on a day that person had not
 * started yet. The error is small, systematic, and lands precisely on the
 * late-night commits a developer is most likely to remember making.
 *
 * The timezone is an **explicit parameter** defaulting to the system's, rather
 * than an implicit read of the ambient clock. That is what makes the bucketing
 * testable: a test can ask for Berlin and New York in the same process, where
 * mutating `process.env.TZ` mid-run is unreliable because V8 caches the zone.
 *
 * The two stages are deliberately separate. Bucketing is timezone-aware;
 * filling the gaps afterwards is pure `YYYY-MM-DD` arithmetic on strings that
 * are already local. That split is also what makes the daylight-saving case
 * correct for free — once a commit is a date string, a 23-hour day is not a
 * thing that can be miscounted.
 */

/** `YYYY-MM-DD` in `timeZone`, or in the system zone when omitted. */
export function localDayKey(epochSeconds: number, timeZone?: string): string {
  // `en-CA` formats as YYYY-MM-DD, which is the output we want rather than
  // something to reassemble from parts.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(epochSeconds * 1000));
}

/**
 * Counts per day, ascending, **including days with no commits**.
 *
 * A heatmap with the empty days omitted is not a heatmap — the gaps are the
 * information. Filling them here rather than in the renderer keeps the widget
 * from having to know anything about calendars.
 */
export function buildCalendar(
  commits: readonly HistoryCommit[],
  timeZone?: string,
): CalendarDay[] {
  if (commits.length === 0) return [];

  const counts = new Map<string, number>();
  for (const commit of commits) {
    const key = localDayKey(commit.at, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Sorting the KEYS rather than the epochs: they are already local dates, and
  // `YYYY-MM-DD` sorts lexicographically in chronological order.
  const keys = [...counts.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return [];

  const days: CalendarDay[] = [];
  for (const date of eachDay(first, last)) {
    days.push({ date, count: counts.get(date) ?? 0 });
  }
  return days;
}

/**
 * Every date from `first` to `last` inclusive.
 *
 * Stepped through `Date.UTC` — not local time — precisely because these strings
 * are *already* local dates. Re-interpreting them in a zone with daylight
 * saving would reintroduce the 23-hour day this function exists to avoid; in
 * UTC every day is 24 hours and the walk cannot skip or repeat one.
 */
export function* eachDay(first: string, last: string): Generator<string> {
  const cursor = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  // A malformed bound would otherwise spin forever.
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return;

  while (cursor.getTime() <= end.getTime()) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
