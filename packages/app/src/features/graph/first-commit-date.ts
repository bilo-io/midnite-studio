import type { GraphRow } from '@midnite/studio-shared';

/**
 * The oldest commit among the loaded rows, by committer date — the same
 * field the Date column renders, so the footer and the column agree.
 *
 * `git log --topo-order` (see git-engine's `log.ts`) only guarantees a child
 * is listed before its parents, not that rows are date-sorted, so the last
 * row is usually but not always the oldest. A real min() is the only
 * correct way to find it.
 */
export function firstCommitDate(rows: readonly GraphRow[]): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    if (oldest === null || row.commit.committerDate < oldest) oldest = row.commit.committerDate;
  }
  return oldest;
}
