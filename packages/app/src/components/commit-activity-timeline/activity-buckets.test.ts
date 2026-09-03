import { describe, expect, it } from 'vitest';

import {
  bucketCommits,
  bucketLabel,
  gridlineIndices,
  GRIDLINE_CADENCE,
  TIMEFRAME_BUCKETS,
  type CommitActivity,
} from './activity-buckets';

/**
 * Times are built with the same local-`Date` arithmetic the bucketer uses, so
 * the assertions hold in any timezone vitest happens to run in.
 */
const NOW = new Date(2026, 8, 3, 14, 30).getTime();

const commit = (
  timestampMs: number,
  lines: { additions?: number; deletions?: number } = {},
): CommitActivity => ({
  sha: `sha-${timestampMs}`,
  timestamp: Math.floor(timestampMs / 1000),
  additions: lines.additions ?? 0,
  deletions: lines.deletions ?? 0,
});

const daysAgo = (days: number, hour = 12): number =>
  new Date(2026, 8, 3 - days, hour).getTime();

describe('bucketCommits', () => {
  it('always returns the full bucket count, empty buckets included', () => {
    for (const timeframe of ['day', 'week', 'month', 'year'] as const) {
      const buckets = bucketCommits([], timeframe, NOW);
      expect(buckets).toHaveLength(TIMEFRAME_BUCKETS[timeframe]);
      expect(buckets.every((b) => b.count === 0)).toBe(true);
    }
  });

  it('returns buckets oldest first, ascending by start', () => {
    const buckets = bucketCommits([], 'month', NOW);
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]!.start).toBeGreaterThan(buckets[i - 1]!.start);
    }
  });

  it('folds a week of commits into local-midnight day buckets', () => {
    const buckets = bucketCommits(
      [
        commit(daysAgo(0), { additions: 5, deletions: 2 }),
        commit(daysAgo(0, 9), { additions: 1 }),
        commit(daysAgo(6, 23), { deletions: 7 }),
      ],
      'week',
      NOW,
    );
    expect(buckets[6]).toMatchObject({ count: 2, additions: 6, deletions: 2 });
    expect(buckets[0]).toMatchObject({ count: 1, additions: 0, deletions: 7 });
    expect(buckets.slice(1, 6).every((b) => b.count === 0)).toBe(true);
  });

  it('buckets the day view by hour', () => {
    const HOUR = 3_600_000;
    const lastStart = Math.floor(NOW / HOUR) * HOUR;
    const buckets = bucketCommits(
      [commit(lastStart + 60_000), commit(lastStart - 3 * HOUR + 1)],
      'day',
      NOW,
    );
    expect(buckets[23]!.count).toBe(1);
    expect(buckets[20]!.count).toBe(1);
  });

  it('drops commits outside the window instead of clamping them', () => {
    const buckets = bucketCommits(
      [
        commit(daysAgo(7)), // before the 7-day window opens
        commit(NOW + 86_400_000), // tomorrow
      ],
      'week',
      NOW,
    );
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
});

describe('bucketCommits, year', () => {
  const monthsAgo = (months: number, date = 15): number =>
    new Date(2026, 8 - months, date, 12).getTime();

  it('opens each bucket on the local 1st, ending with the current month', () => {
    const buckets = bucketCommits([], 'year', NOW);

    expect(buckets).toHaveLength(12);
    for (const bucket of buckets) {
      const at = new Date(bucket.start);
      expect(at.getDate()).toBe(1);
      expect([at.getHours(), at.getMinutes(), at.getSeconds()]).toEqual([0, 0, 0]);
    }
    // Twelve consecutive months ending on the month `NOW` falls in.
    expect(new Date(buckets.at(-1)!.start).getMonth()).toBe(8);
    expect(new Date(buckets[0]!.start).getMonth()).toBe(9);
    expect(new Date(buckets[0]!.start).getFullYear()).toBe(2025);
  });

  it('folds commits into the calendar month they happened in', () => {
    const buckets = bucketCommits(
      [
        commit(monthsAgo(0, 1), { additions: 5 }),
        commit(monthsAgo(0, 28), { additions: 7 }),
        commit(monthsAgo(3), { deletions: 2 }),
      ],
      'year',
      NOW,
    );

    // Both of this month's commits in the last bucket, whole-month spread and
    // all — a 30-day slice would have put the 1st in the previous one.
    expect(buckets.at(-1)).toMatchObject({ count: 2, additions: 12, deletions: 0 });
    expect(buckets.at(-4)).toMatchObject({ count: 1, deletions: 2 });
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });

  it('drops commits older than the window and in the future', () => {
    const buckets = bucketCommits(
      [commit(monthsAgo(12)), commit(new Date(2026, 9, 1).getTime())],
      'year',
      NOW,
    );
    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe('gridlineIndices', () => {
  it('rules a day window on even LOCAL hours, never on index 0', () => {
    const buckets = bucketCommits([], 'day', NOW);
    const marks = gridlineIndices(buckets, 'day');

    expect(marks).not.toContain(0);
    // Twelve even hours in 24, minus the one that would land on index 0 if the
    // window happens to open on an even hour.
    expect(marks.length).toBeGreaterThanOrEqual(11);
    expect(marks.length).toBeLessThanOrEqual(12);
    for (const index of marks) {
      expect(new Date(buckets[index]!.start).getHours() % 2).toBe(0);
    }
  });

  it('rules a week window at every day boundary but the first', () => {
    const buckets = bucketCommits([], 'week', NOW);
    expect(gridlineIndices(buckets, 'week')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rules a month window on Mondays, seven apart', () => {
    const buckets = bucketCommits([], 'month', NOW);
    const marks = gridlineIndices(buckets, 'month');

    expect(marks).toHaveLength(4);
    for (const index of marks) {
      expect(new Date(buckets[index]!.start).getDay()).toBe(1);
    }
    expect(marks.map((index, i) => index - (marks[0]! + i * 7))).toEqual([0, 0, 0, 0]);
  });

  it('rules a year window on calendar quarters', () => {
    const buckets = bucketCommits([], 'year', NOW);
    const marks = gridlineIndices(buckets, 'year');

    expect(marks).not.toContain(0);
    for (const index of marks) {
      expect(new Date(buckets[index]!.start).getMonth() % 3).toBe(0);
    }
    // Four quarter starts in twelve months, less any that lands on index 0.
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks.length).toBeLessThanOrEqual(4);
  });

  it('names its own cadence for every timeframe', () => {
    expect(Object.keys(GRIDLINE_CADENCE).sort()).toEqual(['day', 'month', 'week', 'year']);
  });
});

describe('bucketLabel', () => {
  it('gives an hour bucket a clock range and a date', () => {
    const [bucket] = bucketCommits([], 'day', NOW).slice(-1);
    const label = bucketLabel(bucket!, 'day');
    expect(label).toContain('–');
    // Both ends of the range, an hour apart.
    expect(label.split('–')).toHaveLength(2);
  });

  it('gives a month bucket its month and year, distinct across the window', () => {
    const year = bucketCommits([], 'year', NOW);
    const labels = year.map((bucket) => bucketLabel(bucket, 'year'));

    expect(labels).toHaveLength(12);
    expect(new Set(labels).size).toBe(12);
    // The window straddles a new year, which is what the year in the label is
    // for: December and January are adjacent buckets twelve months apart.
    expect(labels[2]).toContain('2025');
    expect(labels.at(-1)).toContain('2026');
    expect(labels.at(-1)).not.toContain('–');
  });

  it('gives a day bucket the weekday, and no clock at all', () => {
    const week = bucketCommits([], 'week', NOW);
    const label = bucketLabel(week.at(-1)!, 'week');
    expect(label).not.toContain('–');
    // Distinct per bucket — a label that lost the date would collapse the
    // seven of them onto one string, which `toContain('3')` would not catch.
    expect(new Set(week.map((bucket) => bucketLabel(bucket, 'week'))).size).toBe(7);
    // The weekday-bearing form, which the day view's own label never carries.
    const dayForm = bucketLabel(bucketCommits([], 'day', NOW).at(-1)!, 'day');
    expect(label).not.toBe(dayForm);
  });
});
