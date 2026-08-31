import type { GraphRow } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { firstCommitDate } from './first-commit-date';

const row = (committerDate: number, sha = Math.random().toString(36)): GraphRow => ({
  row: 0,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [],
  commit: {
    sha,
    parents: [],
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    authorDate: committerDate,
    committerDate,
    subject: '',
    refs: [],
  },
});

describe('firstCommitDate', () => {
  it('returns null for an empty row list', () => {
    expect(firstCommitDate([])).toBeNull();
  });

  it('returns the earliest committer date, regardless of row order', () => {
    const rows = [row(3000), row(1000), row(2000)];
    expect(firstCommitDate(rows)).toBe(1000);
  });

  it('is not fooled by the last row not being the oldest (topo- not date-order)', () => {
    // A backdated commit topologically last but not chronologically first.
    const rows = [row(2000), row(1500), row(9999)];
    expect(firstCommitDate(rows)).toBe(1500);
  });
});
