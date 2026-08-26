import { describe, expect, it } from 'vitest';

import { buildCalendar, localDayKey } from './calendar';
import type { HistoryCommit } from './commit-history';

const commit = (at: number): HistoryCommit => ({
  sha: `${at}`,
  at,
  authorName: 'A',
  authorEmail: 'a@example.com',
  subject: 's',
});

/*
 * The zone is passed to the function under test, never set on the process.
 * Mutating `process.env.TZ` mid-run is unreliable — V8 caches the resolved
 * zone — and it cannot express "these two zones disagree about this instant",
 * which is the only assertion here worth making.
 */

describe('localDayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(localDayKey(1_700_000_000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('buckets a late-evening commit into the local day, not the UTC one', () => {
    // Berlin is UTC+1 in early March — DST does not start until the 31st. So
    // 2024-03-05T23:30Z is 00:30 on the 6th to the person who wrote it, and
    // still the 5th in UTC. That disagreement is the entire bug this avoids.
    const epoch = Date.UTC(2024, 2, 5, 23, 30) / 1000;
    expect(localDayKey(epoch, 'Europe/Berlin')).toBe('2024-03-06');
    expect(localDayKey(epoch, 'UTC')).toBe('2024-03-05');
  });

  it('buckets a US-morning commit into the local day west of UTC', () => {
    // 2024-03-05T02:00Z is still the 4th in New York.
    const epoch = Date.UTC(2024, 2, 5, 2, 0) / 1000;
    expect(localDayKey(epoch, 'America/New_York')).toBe('2024-03-04');
  });
});

describe('buildCalendar', () => {
  it('is empty for a repository with no commits', () => {
    expect(buildCalendar([])).toEqual([]);
  });

  it('counts commits per day', () => {
    const day = Date.UTC(2024, 0, 10, 12) / 1000;
    const days = buildCalendar([commit(day), commit(day + 60), commit(day + 120)], 'UTC');
    expect(days).toEqual([{ date: '2024-01-10', count: 3 }]);
  });

  it('fills the empty days between, because the gaps are the information', () => {
    const first = Date.UTC(2024, 0, 1, 12) / 1000;
    const third = Date.UTC(2024, 0, 3, 12) / 1000;
    expect(buildCalendar([commit(first), commit(third)], 'UTC')).toEqual([
      { date: '2024-01-01', count: 1 },
      { date: '2024-01-02', count: 0 },
      { date: '2024-01-03', count: 1 },
    ]);
  });

  it('walks by calendar date across a DST transition rather than by 86400s', () => {
    // Europe/Berlin springs forward on 2024-03-31. A fixed-seconds step either
    // skips a date or repeats one; stepping by calendar date cannot.
    const start = Date.UTC(2024, 2, 29, 11) / 1000;
    const end = Date.UTC(2024, 3, 2, 11) / 1000;
    const days = buildCalendar([commit(start), commit(end)], 'Europe/Berlin');
    expect(days.map((d) => d.date)).toEqual([
      '2024-03-29',
      '2024-03-30',
      '2024-03-31',
      '2024-04-01',
      '2024-04-02',
    ]);
    // No duplicates and no gap — the failure modes of a fixed-86400s walk.
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length);
  });

  it('is ascending regardless of the order commits arrived in', () => {
    // git log is newest-first, so this is the real input order.
    const later = Date.UTC(2024, 0, 5, 12) / 1000;
    const earlier = Date.UTC(2024, 0, 3, 12) / 1000;
    const days = buildCalendar([commit(later), commit(earlier)], 'UTC');
    expect(days[0]!.date).toBe('2024-01-03');
    expect(days.at(-1)!.date).toBe('2024-01-05');
  });
});
