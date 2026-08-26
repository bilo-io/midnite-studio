import type { ChurnStats } from '@midnite/git-shared';

import type { HistoryCommit } from './commit-history';

/**
 * Which files move the most.
 *
 * Ranked by **commits that touched the file**, not by lines changed. A
 * generated lockfile rewritten once in a 90,000-line diff would top any
 * line-based ranking while telling you nothing; a file thirty commits have had
 * to touch is genuinely where the work is. Lines are reported alongside because
 * they are worth seeing, just not worth sorting on.
 *
 * Merge commits never reach here — the traversal passes `--no-merges` whenever
 * churn is requested, because a merge's `--numstat` is the entire branch it
 * brought in, so counting merges double-counts every line in the repository and
 * attributes it to whoever pressed the button.
 */

/** How many files the table reports. The rest are counted, not listed. */
export const CHURN_TOP_N = 25;

export function buildChurn(
  commits: readonly HistoryCommit[],
  topN: number = CHURN_TOP_N,
): ChurnStats {
  const byPath = new Map<string, { insertions: number; deletions: number; commits: number }>();

  for (const commit of commits) {
    if (!commit.files) continue;
    // A commit that touches the same path twice cannot happen in git, but a
    // rename pair can collapse to one post-rename path — count the file once
    // per commit regardless, or `commits` stops meaning "commits".
    const seen = new Set<string>();
    for (const file of commit.files) {
      const entry = byPath.get(file.path) ?? { insertions: 0, deletions: 0, commits: 0 };
      entry.insertions += file.insertions ?? 0;
      entry.deletions += file.deletions ?? 0;
      if (!seen.has(file.path)) {
        entry.commits += 1;
        seen.add(file.path);
      }
      byPath.set(file.path, entry);
    }
  }

  const ranked = [...byPath.entries()]
    .map(([path, entry]) => ({ path, ...entry }))
    .sort(
      (a, b) =>
        b.commits - a.commits ||
        b.insertions + b.deletions - (a.insertions + a.deletions) ||
        // Path last, so the order is stable for two files that are otherwise
        // identical — an unstable table reshuffles itself on every refresh.
        a.path.localeCompare(b.path),
    );

  return {
    files: ranked.slice(0, topN),
    // Said out loud rather than silently dropped, per the Phase 17 rule: a cap
    // you cannot see reads as "these are all the files that changed".
    withheld: Math.max(0, ranked.length - topN),
  };
}
