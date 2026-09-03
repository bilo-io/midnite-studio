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
    for (const timeframe of ['day', 'week', 'month'] as const) {
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

  it('names its own cadence for every timeframe', () => {
    expect(Object.keys(GRIDLINE_CADENCE).sort()).toEqual(['day', 'month', 'week']);
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

  it('gives a day bucket the weekday, and no clock at all', () => {
    const [bucket] = bucketCommits([], 'week', NOW).slice(-1);
    const label = bucketLabel(bucket!, 'week');
    expect(label).not.toContain('–');
    expect(label).toContain('3');
  });
});
