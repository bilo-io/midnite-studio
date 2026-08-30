import { describe, expect, it } from 'vitest';

import type { RepoStats } from '@midnite/studio-shared';

import { byCommits, calendarWeeks, levelFor, newestFirst, scopeStats } from './dashboard-derive';

const health: RepoStats['health'] = {
  localBranches: 4,
  remoteBranches: 2,
  tags: 1,
  staleByAge: 1,
  mergedBranches: 2,
  oldestUnmergedAt: null,
  sizeBytes: null,
  looseObjects: null,
};

/** 2026-03-02 12:00 local, as a UTC epoch — comfortably inside one local day. */
const at = (day: number, hour = 12): number =>
  Math.floor(new Date(2026, 2, day, hour, 0, 0).getTime() / 1000);

const baseStats = (over: Partial<RepoStats> = {}): RepoStats => ({
  repoId: 'r1',
  window: '90d',
  generatedAt: 0,
  truncated: false,
  commitsScanned: 3,
  calendar: [],
  contributors: [],
  activity: [],
  churn: null,
  health,
  ...over,
});

describe('scopeStats', () => {
  const stats = baseStats({
    calendar: [
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-02', count: 1 },
    ],
    contributors: [
      {
        email: 'a@example.com',
        name: 'Ada',
        commits: 2,
        insertions: 10,
        deletions: 3,
        firstAt: at(1),
        lastAt: at(2),
      },
      {
        email: 'b@example.com',
        name: 'Bo',
        commits: 1,
        insertions: 4,
        deletions: 0,
        firstAt: at(1),
        lastAt: at(1),
      },
    ],
    activity: [
      { sha: 'c3', at: at(2), authorName: 'Ada', authorEmail: 'a@example.com', subject: 'three' },
      { sha: 'c2', at: at(1), authorName: 'Bo', authorEmail: 'b@example.com', subject: 'two' },
      { sha: 'c1', at: at(1), authorName: 'Ada', authorEmail: 'a@example.com', subject: 'one' },
    ],
    churn: { files: [{ path: 'a.ts', insertions: 9, deletions: 1, commits: 2 }], withheld: 0 },
  });

  it('returns the payload untouched when nobody is selected', () => {
    // Empty selection means EVERYONE, not nobody — the MultiSelectMenu rule.
    expect(scopeStats(stats, [])).toBe(stats);
  });

  it('recounts the calendar from the surviving commits', () => {
    const scoped = scopeStats(stats, ['a@example.com']);
    expect(scoped.calendar).toEqual([
      { date: '2026-03-01', count: 1 },
      { date: '2026-03-02', count: 1 },
    ]);
  });

  it('keeps every day the unfiltered calendar had, including the ones that fall to zero', () => {
    const scoped = scopeStats(stats, ['b@example.com']);
    // The grid must not change shape when filtered, or it stops reading as a
    // calendar. Bo has nothing on the 2nd; the cell stays, at zero.
    expect(scoped.calendar).toEqual([
      { date: '2026-03-01', count: 1 },
      { date: '2026-03-02', count: 0 },
    ]);
  });

  it('filters contributors and the activity feed to the selection', () => {
    const scoped = scopeStats(stats, ['a@example.com']);
    expect(scoped.contributors.map((c) => c.email)).toEqual(['a@example.com']);
    expect(scoped.activity.map((e) => e.sha)).toEqual(['c3', 'c1']);
  });

  it('matches emails case-insensitively', () => {
    // Git records whatever was configured; `A@Example.com` and `a@example.com`
    // are one person and a filter that disagreed would show an empty board.
    const scoped = scopeStats(stats, ['A@Example.com']);
    expect(scoped.activity).toHaveLength(2);
  });

  it('drops churn rather than leaving it unfiltered beside filtered neighbours', () => {
    // ChurnStats aggregates per FILE with no authorship at all, so there is
    // nothing to filter it by — and a tile silently answering a different
    // question than the ones next to it is worse than an empty one.
    expect(scopeStats(stats, ['a@example.com']).churn).toBeNull();
  });

  it('leaves health alone — it describes the repo, not the people', () => {
    expect(scopeStats(stats, ['a@example.com']).health).toEqual(health);
  });
});

describe('levelFor', () => {
  it('gives no commits level 0 and any commit at least level 1', () => {
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(1, 100)).toBe(1);
  });

  it('always puts the busiest day at the top of the ramp', () => {
    expect(levelFor(3, 3)).toBe(4);
    expect(levelFor(80, 80)).toBe(4);
  });

  it('scales to the repo rather than to a fixed threshold', () => {
    // Two commits is a quiet day in a busy repo and a busy one in a quiet repo.
    expect(levelFor(2, 40)).toBe(1);
    expect(levelFor(2, 2)).toBe(4);
  });

  it('handles the one-commit repo without dividing by a smaller busiest', () => {
    expect(levelFor(1, 1)).toBe(4);
    expect(levelFor(1, 0)).toBe(4);
  });
});

describe('calendarWeeks', () => {
  it('is empty for a repo with no history', () => {
    expect(calendarWeeks([])).toEqual({ weeks: [], busiest: 0, total: 0 });
  });

  it('pads the first column so every row is one weekday', () => {
    // 2026-03-03 is a Tuesday, so the column needs Sunday and Monday padded.
    const { weeks } = calendarWeeks([{ date: '2026-03-03', count: 1 }]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.[0]).toBeNull();
    expect(weeks[0]?.[1]).toBeNull();
    expect(weeks[0]?.[2]?.date).toBe('2026-03-03');
  });

  it('pads the last column to a full seven cells', () => {
    const { weeks } = calendarWeeks([{ date: '2026-03-01', count: 1 }]);
    // 2026-03-01 is a Sunday: no leading pad, six trailing nulls.
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0]?.slice(1).every((cell) => cell === null)).toBe(true);
  });

  it('does not shift the grid across a DST boundary', () => {
    /*
      US DST began 2026-03-08. The date strings are already LOCAL calendar days
      (main bucketed them), so re-parsing at local midnight and asking for the
      weekday risks the hour crossing the transition and moving the whole grid
      by a row. Parsed at UTC noon, 2026-03-08 is a Sunday either way.
    */
    const { weeks } = calendarWeeks([
      { date: '2026-03-07', count: 1 },
      { date: '2026-03-08', count: 1 },
      { date: '2026-03-09', count: 1 },
    ]);
    // Saturday closes a column; Sunday opens the next.
    expect(weeks[0]?.[6]?.date).toBe('2026-03-07');
    expect(weeks[1]?.[0]?.date).toBe('2026-03-08');
    expect(weeks[1]?.[1]?.date).toBe('2026-03-09');
  });

  it('reports the busiest day and the total across the window', () => {
    const { busiest, total } = calendarWeeks([
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-02', count: 7 },
      { date: '2026-03-03', count: 0 },
    ]);
    expect(busiest).toBe(7);
    expect(total).toBe(9);
  });

  it('sorts days it was handed out of order', () => {
    const { weeks } = calendarWeeks([
      { date: '2026-03-02', count: 1 },
      { date: '2026-03-01', count: 1 },
    ]);
    expect(weeks[0]?.[0]?.date).toBe('2026-03-01');
    expect(weeks[0]?.[1]?.date).toBe('2026-03-02');
  });
});

describe('byCommits and newestFirst', () => {
  it('ranks contributors by commits, then by name', () => {
    const people = byCommits([
      { email: 'b@x', name: 'Bo', commits: 1, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
      { email: 'a@x', name: 'Ada', commits: 5, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
      { email: 'c@x', name: 'Cy', commits: 1, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
    ]);
    expect(people.map((p) => p.name)).toEqual(['Ada', 'Bo', 'Cy']);
  });

  it('orders the feed newest first even when handed it out of order', () => {
    const feed = newestFirst([
      { sha: 'old', at: 100, authorName: 'A', authorEmail: 'a@x', subject: 'old' },
      { sha: 'new', at: 900, authorName: 'A', authorEmail: 'a@x', subject: 'new' },
    ]);
    expect(feed.map((e) => e.sha)).toEqual(['new', 'old']);
  });
});
