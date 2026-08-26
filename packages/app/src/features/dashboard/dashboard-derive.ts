import type { ActivityEntry, ContributorStat, RepoStats } from '@midnite/git-shared';

/**
 * The board-wide author filter, and the calendar's geometry.
 *
 * Pure functions over the one `RepoStats` payload, kept out of the components
 * for the usual reason and one specific one: the author filter has to produce
 * the SAME answer for the calendar, the feed and the churn tile, and three
 * components each filtering in their own `useMemo` is three chances for them to
 * disagree. Deriving a filtered `RepoStats` once means "scoped to this author"
 * is a single computation the whole board reads.
 */

/** Empty selection means everyone — the `MultiSelectMenu` rule. */
export const isEveryone = (authors: readonly string[]): boolean => authors.length === 0;

const normalise = (email: string): string => email.trim().toLowerCase();

/**
 * Re-bucket the calendar from the entries that survive the filter.
 *
 * The server's `calendar` counts every author, so scoping the board cannot just
 * slice it — the counts themselves change. It CAN be rebuilt from `activity`,
 * which carries one row per commit with its author and its timestamp, and this
 * is the only place the two have to agree.
 *
 * The day key is derived the same way main derives it: local time, not UTC.
 * `toLocaleDateString('en-CA')` yields `YYYY-MM-DD` in the viewer's own
 * timezone — matching the format `CalendarDay.date` is documented to carry, and
 * matching main's bucketing, so a filtered calendar and an unfiltered one put
 * the same commit in the same cell.
 */
export const localDayKey = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toLocaleDateString('en-CA');

/**
 * Scope the whole payload to a set of author emails.
 *
 * `activity` is the source of truth for the recount because it is the only
 * array carrying per-commit authorship. When the traversal truncated, the feed
 * is a prefix of history rather than all of it — so a filtered calendar is a
 * count over what we actually have, which is exactly what `RepoStats.truncated`
 * exists to let the widgets say out loud.
 *
 * Churn is dropped rather than recomputed: `ChurnStats` aggregates per FILE
 * across all authors and carries no authorship at all, so there is nothing to
 * filter it by. Returning it unchanged beside a filtered calendar would be a
 * tile quietly answering a different question than its neighbours.
 */
export function scopeStats(stats: RepoStats, authors: readonly string[]): RepoStats {
  if (isEveryone(authors)) return stats;

  const wanted = new Set(authors.map(normalise));
  const activity = stats.activity.filter((entry) => wanted.has(normalise(entry.authorEmail)));

  const counts = new Map<string, number>();
  for (const entry of activity) {
    const key = localDayKey(entry.at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  /*
    Every day the unfiltered calendar had is kept, at its new count — including
    the ones that fall to zero. A heatmap whose cells disappeared when filtered
    would change shape as well as colour, and the empty cells are what make the
    grid readable as a calendar rather than as a scatter of dots.
  */
  const calendar = stats.calendar.map((day) => ({
    date: day.date,
    count: counts.get(day.date) ?? 0,
  }));

  return {
    ...stats,
    calendar,
    contributors: stats.contributors.filter((person) => wanted.has(normalise(person.email))),
    activity,
    churn: null,
  };
}

/** One cell of the heatmap, with the intensity step it renders at. */
export type CalendarCell = {
  date: string;
  count: number;
  /** 0 (no commits) to 4 (the busiest band). */
  level: 0 | 1 | 2 | 3 | 4;
};

/**
 * Bucket counts into five bands, scaled to the repo's own busiest day.
 *
 * Relative rather than absolute thresholds: a repo where a busy day is three
 * commits and one where it is eighty both need the full range of the ramp, and
 * a fixed scale would render the first as uniformly cold and the second as
 * uniformly hot. The busiest day is always level 4 and any commit at all is at
 * least level 1, so "worked that day" is never indistinguishable from "did not".
 */
export function levelFor(count: number, busiest: number): CalendarCell['level'] {
  if (count <= 0) return 0;
  if (busiest <= 1) return 4;
  const ratio = count / busiest;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/**
 * The calendar as columns of seven days, GitHub-style.
 *
 * Weeks start on Sunday and every column is a full seven cells, padded at both
 * ends with `null`, because a grid whose first column is short by three cells
 * puts every subsequent row on a different weekday — which is the one thing a
 * day-of-week heatmap is read for.
 */
export function calendarWeeks(days: readonly { date: string; count: number }[]): {
  weeks: (CalendarCell | null)[][];
  busiest: number;
  total: number;
} {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const busiest = sorted.reduce((max, day) => Math.max(max, day.count), 0);
  const total = sorted.reduce((sum, day) => sum + day.count, 0);
  if (sorted.length === 0) return { weeks: [], busiest: 0, total: 0 };

  const weeks: (CalendarCell | null)[][] = [];
  let column: (CalendarCell | null)[] = [];

  /*
    Parsed as UTC noon rather than through `new Date('YYYY-MM-DD')` local
    midnight. The string is already a LOCAL calendar day — main bucketed it —
    so re-parsing it in local time and then asking for its weekday risks the
    hour shifting across a DST boundary and moving the whole grid by a row.
    Noon UTC is far enough from either edge that no offset can reach it.
  */
  const weekdayOf = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();

  const first = sorted[0];
  if (first) {
    for (let pad = 0; pad < weekdayOf(first.date); pad += 1) column.push(null);
  }

  for (const day of sorted) {
    column.push({ date: day.date, count: day.count, level: levelFor(day.count, busiest) });
    if (column.length === 7) {
      weeks.push(column);
      column = [];
    }
  }
  if (column.length > 0) {
    while (column.length < 7) column.push(null);
    weeks.push(column);
  }

  return { weeks, busiest, total };
}

/**
 * The contributor list as the author filter's options.
 *
 * Sorted by commits so the menu opens on the people whose names the user is
 * most likely to be reaching for, rather than on whoever git happened to
 * enumerate first.
 */
export const byCommits = (contributors: readonly ContributorStat[]): ContributorStat[] =>
  [...contributors].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));

/** Newest first. `activity` arrives ordered, but a filter must not rely on that. */
export const newestFirst = (entries: readonly ActivityEntry[]): ActivityEntry[] =>
  [...entries].sort((a, b) => b.at - a.at);
