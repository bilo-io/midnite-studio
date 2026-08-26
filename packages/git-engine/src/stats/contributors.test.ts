import { describe, expect, it } from 'vitest';

import type { HistoryCommit } from './commit-history';
import { buildContributors } from './contributors';

const commit = (
  over: Partial<HistoryCommit> & Pick<HistoryCommit, 'at' | 'authorEmail'>,
): HistoryCommit => ({
  sha: `${over.at}`,
  authorName: 'Ada Lovelace',
  subject: 's',
  ...over,
});

describe('buildContributors', () => {
  it('is empty for a repository with no commits', () => {
    expect(buildContributors([])).toEqual([]);
  });

  it('aggregates by email, not by display name', () => {
    // The reason this module exists: people change how their name is spelled,
    // and a name-keyed leaderboard splits one person into three strangers.
    const stats = buildContributors([
      commit({ at: 300, authorEmail: 'ada@example.com', authorName: 'Ada Lovelace' }),
      commit({ at: 200, authorEmail: 'ada@example.com', authorName: 'ada' }),
      commit({ at: 100, authorEmail: 'ada@example.com', authorName: 'A. Lovelace' }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]!.commits).toBe(3);
  });

  it('labels a person with their most recent name, not their first', () => {
    // Showing the oldest name means the table is out of date the moment
    // anybody updates their git config.
    const stats = buildContributors([
      commit({ at: 100, authorEmail: 'a@example.com', authorName: 'Old Name' }),
      commit({ at: 900, authorEmail: 'a@example.com', authorName: 'New Name' }),
    ]);
    expect(stats[0]!.name).toBe('New Name');
  });

  it('treats an address as case-insensitive', () => {
    const stats = buildContributors([
      commit({ at: 100, authorEmail: 'Ada@Example.com' }),
      commit({ at: 200, authorEmail: 'ada@example.com' }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]!.commits).toBe(2);
  });

  it('keeps genuinely different people apart', () => {
    const stats = buildContributors([
      commit({ at: 100, authorEmail: 'ada@example.com', authorName: 'Ada' }),
      commit({ at: 200, authorEmail: 'grace@example.com', authorName: 'Grace' }),
    ]);
    expect(stats).toHaveLength(2);
  });

  it('tracks the first and last time each person committed', () => {
    const stats = buildContributors([
      commit({ at: 500, authorEmail: 'a@example.com' }),
      commit({ at: 100, authorEmail: 'a@example.com' }),
      commit({ at: 300, authorEmail: 'a@example.com' }),
    ]);
    expect(stats[0]).toMatchObject({ firstAt: 100, lastAt: 500 });
  });

  it('ranks by commit count, most first', () => {
    const stats = buildContributors([
      commit({ at: 100, authorEmail: 'quiet@example.com' }),
      commit({ at: 200, authorEmail: 'busy@example.com' }),
      commit({ at: 300, authorEmail: 'busy@example.com' }),
    ]);
    expect(stats.map((s) => s.email)).toEqual(['busy@example.com', 'quiet@example.com']);
  });

  it('reports line counts as null when churn was not requested', () => {
    // Not zero: "we did not measure this" and "this person wrote no lines" are
    // different claims, and the table renders them differently.
    const stats = buildContributors([commit({ at: 100, authorEmail: 'a@example.com' })]);
    expect(stats[0]!.insertions).toBeNull();
    expect(stats[0]!.deletions).toBeNull();
  });

  it('sums insertions and deletions when churn was requested', () => {
    const stats = buildContributors([
      commit({
        at: 100,
        authorEmail: 'a@example.com',
        files: [
          { path: 'a.ts', insertions: 10, deletions: 2 },
          { path: 'b.ts', insertions: 5, deletions: 0 },
        ],
      }),
      commit({
        at: 200,
        authorEmail: 'a@example.com',
        files: [{ path: 'c.ts', insertions: 1, deletions: 1 }],
      }),
    ]);
    expect(stats[0]).toMatchObject({ insertions: 16, deletions: 3 });
  });

  it('counts a binary file as contributing no lines, without discarding the commit', () => {
    const stats = buildContributors([
      commit({
        at: 100,
        authorEmail: 'a@example.com',
        files: [
          { path: 'logo.png', insertions: null, deletions: null },
          { path: 'a.ts', insertions: 3, deletions: 0 },
        ],
      }),
    ]);
    expect(stats[0]).toMatchObject({ commits: 1, insertions: 3, deletions: 0 });
  });
});
