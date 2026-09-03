import { describe, expect, it } from 'vitest';

import type { HistoryCommit } from './commit-history';
import { STATS_MAX_COMMITS } from './index';
import { buildTimeline, TIMELINE_LIMIT } from './timeline';

const commit = (overrides: Partial<HistoryCommit> & { sha: string }): HistoryCommit => ({
  at: 1_700_000_000,
  authorName: 'A',
  authorEmail: 'a@example.com',
  subject: 'subject',
  ...overrides,
});

describe('buildTimeline', () => {
  it('keeps "churn not requested" distinct from "no lines changed"', () => {
    const rows = buildTimeline([
      commit({ sha: 'no-files' }),
      commit({ sha: 'empty-files', files: [] }),
    ]);
    expect(rows[0]).toMatchObject({ sha: 'no-files', additions: null, deletions: null });
    expect(rows[1]).toMatchObject({ sha: 'empty-files', additions: 0, deletions: 0 });
  });

  it('sums per-file counts, treating binary nulls as zero', () => {
    const rows = buildTimeline([
      commit({
        sha: 'mixed',
        files: [
          { path: 'a.ts', insertions: 3, deletions: 1 },
          { path: 'img.png', insertions: null, deletions: null },
          { path: 'b.ts', insertions: 4, deletions: 2 },
        ],
      }),
    ]);
    expect(rows[0]).toMatchObject({ additions: 7, deletions: 3 });
  });

  /*
    The cap is the scan cap on purpose: this slice drops the OLDEST rows, so a
    smaller number would silently zero the far end of the year view's window.
  */
  it('caps at the scan cap, so rows are never a subset of what was scanned', () => {
    expect(TIMELINE_LIMIT).toBe(STATS_MAX_COMMITS);
  });

  it('caps at TIMELINE_LIMIT, keeping the newest (first) rows', () => {
    const commits = Array.from({ length: TIMELINE_LIMIT + 10 }, (_, i) =>
      commit({ sha: `sha-${i}`, at: 2_000_000_000 - i }),
    );
    const rows = buildTimeline(commits);
    expect(rows).toHaveLength(TIMELINE_LIMIT);
    expect(rows[0]?.sha).toBe('sha-0');
  });
});
