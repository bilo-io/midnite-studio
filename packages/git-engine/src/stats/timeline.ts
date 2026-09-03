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
 * Hard cap on timeline rows, newest first.
 *
 * The envelope is cached and crosses IPC whole; a decade-deep `all` window at
 * 20,000 scanned commits would ship a megabyte of rows to a widget that draws
 * at most thirty buckets. 5,000 comfortably covers the 30-day window the
 * timeline actually reads, and the envelope's own `truncated` already says
 * when the scan itself was cut short.
 */
export const TIMELINE_LIMIT = 5_000;

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
