import type { GraphRow } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { summariseAuthors } from './author-filter';

const row = (authorName: string, authorEmail: string, sha = Math.random().toString(36)): GraphRow => ({
  row: 0,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [],
  commit: {
    sha,
    parents: [],
    authorName,
    authorEmail,
    authorDate: 0,
    committerDate: 0,
    subject: '',
    refs: [],
  },
});

describe('summariseAuthors', () => {
  it('counts commits per author', () => {
    const authors = summariseAuthors([
      row('Ada Lovelace', 'ada@example.com'),
      row('Ada Lovelace', 'ada@example.com'),
      row('Grace Hopper', 'grace@example.com'),
    ]);

    expect(authors).toEqual([
      { email: 'ada@example.com', name: 'Ada Lovelace', commits: 2 },
      { email: 'grace@example.com', name: 'Grace Hopper', commits: 1 },
    ]);
  });

  it('merges identities that differ only by case or spacing', () => {
    // One person routinely commits as "Ada" and "ada lovelace" from the same
    // address; splitting them would make the filter miss half their work.
    const authors = summariseAuthors([
      row('Ada Lovelace', 'ada@example.com'),
      row('ada', ' ADA@Example.COM '),
    ]);

    expect(authors).toHaveLength(1);
    expect(authors[0]).toMatchObject({ email: 'ada@example.com', commits: 2 });
  });

  it('sorts by commit count, then by name', () => {
    const authors = summariseAuthors([
      row('Zoe', 'z@example.com'),
      row('Alan', 'a@example.com'),
      row('Alan', 'a@example.com'),
      row('Bea', 'b@example.com'),
    ]);

    expect(authors.map((a) => a.name)).toEqual(['Alan', 'Bea', 'Zoe']);
  });

  it('returns nothing for an empty graph', () => {
    expect(summariseAuthors([])).toEqual([]);
  });
});
