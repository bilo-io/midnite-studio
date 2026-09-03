import type { TimelineCommit } from '@midnite/studio-shared';

import type { HistoryCommit } from './commit-history';

/**
 * The per-commit rows the activity timeline buckets — a fourth folding of the
 * same commit stream the calendar, contributors and churn already fold.
 *
 * Kept per-commit rather than pre-bucketed because the bucket size is a
 * renderer decision (hours for a day view, days for a month view) and one that
 * changes with a click; re-traversing history to change granularity would put
 * the expensive half back on the wrong side of the cache.
 */

/**
 * Hard cap on timeline rows, newest first — deliberately the **same** number as
 * `STATS_MAX_COMMITS`, so the rows are never a subset of what was scanned.
 *
 * Written as a literal rather than imported from `index.ts`, which imports
 * *this* module: a cycle would leave the constant `undefined` at module-eval
 * time. `timeline.test.ts` asserts the two agree.
 *
 * It used to be 5,000, on the reasoning that a decade-deep `all` window would
 * otherwise ship a megabyte of rows to a widget drawing thirty buckets. That
 * held only while the widest timeframe was 30 days. The year view buckets the
 * last twelve months, and this slice drops the **oldest** rows: on a repository
 * with more than 5,000 commits in the window, the far end of the chart would
 * have read as no commits at all — a silently wrong chart, not a coarse one,
 * and one the envelope's `truncated` flag would not have mentioned, because the
 * scan itself was never cut short.
 *
 * Matching the scan cap makes `truncated` cover this truncation too, and pays
 * for it in payload only on repositories that already hit that cap.
 */
export const TIMELINE_LIMIT = 20_000;

/**
 * Line counts follow the contributors' convention: null when churn was not
 * requested ("not measured"), and a binary file's null `--numstat` counts sum
 * as zero — they are simply not lines.
 */
export function buildTimeline(commits: readonly HistoryCommit[]): TimelineCommit[] {
  return commits.slice(0, TIMELINE_LIMIT).map((commit) => ({
    sha: commit.sha,
    at: commit.at,
    additions: commit.files ? sumOf(commit.files, 'insertions') : null,
    deletions: commit.files ? sumOf(commit.files, 'deletions') : null,
  }));
}

const sumOf = (
  files: readonly { insertions: number | null; deletions: number | null }[],
  key: 'insertions' | 'deletions',
): number => files.reduce((total, file) => total + (file[key] ?? 0), 0);
