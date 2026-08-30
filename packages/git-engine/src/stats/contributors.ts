import type { ContributorStat } from '@midnite/studio-shared';

import type { HistoryCommit } from './commit-history';

/**
 * Who commits here, aggregated by **email** and labelled with the most recent
 * name that email used.
 *
 * Keying on the display name is the obvious implementation and it is wrong:
 * people change how their name is spelled — a new laptop configured as `bilo`,
 * a rename, a transliteration — and a leaderboard keyed on name splits one
 * person into three entries that each look like a stranger, none of whom did
 * enough work to appear near the top.
 *
 * Email is not a perfect identity either (the same person has a work address
 * and a personal one), which is what `.mailmap` is for — and the traversal
 * already passes `--use-mailmap`, so by the time commits reach here the
 * repository's own identity mapping has been applied.
 *
 * **Most recent name, not first.** A name change should show the current name;
 * showing the oldest one means the table is permanently out of date the moment
 * anybody updates their git config.
 */
export function buildContributors(commits: readonly HistoryCommit[]): ContributorStat[] {
  const byEmail = new Map<string, ContributorStat>();
  let sawChurn = false;

  for (const commit of commits) {
    // Case-insensitively: addresses are case-insensitive in the part that
    // matters, and `Bilo@Example.com` and `bilo@example.com` are one person.
    const key = commit.authorEmail.toLowerCase();
    const existing = byEmail.get(key);
    const files = commit.files;
    if (files) sawChurn = true;

    const insertions = files ? sumOf(files, 'insertions') : 0;
    const deletions = files ? sumOf(files, 'deletions') : 0;

    if (!existing) {
      byEmail.set(key, {
        email: commit.authorEmail,
        name: commit.authorName,
        commits: 1,
        insertions,
        deletions,
        firstAt: commit.at,
        lastAt: commit.at,
      });
      continue;
    }

    existing.commits += 1;
    existing.insertions = (existing.insertions ?? 0) + insertions;
    existing.deletions = (existing.deletions ?? 0) + deletions;
    if (commit.at < existing.firstAt) existing.firstAt = commit.at;
    if (commit.at > existing.lastAt) {
      existing.lastAt = commit.at;
      // The name that goes with the latest commit, not the first one seen.
      existing.name = commit.authorName;
      existing.email = commit.authorEmail;
    }
  }

  const contributors = [...byEmail.values()];
  // Churn was not requested: report null rather than a sum of zeroes, so the
  // widget can omit the column instead of claiming nobody wrote any lines.
  if (!sawChurn) {
    for (const entry of contributors) {
      entry.insertions = null;
      entry.deletions = null;
    }
  }

  return contributors.sort((a, b) => b.commits - a.commits || b.lastAt - a.lastAt);
}

/** Binary files contribute `null`, which is not zero — they are simply not lines. */
const sumOf = (
  files: readonly { insertions: number | null; deletions: number | null }[],
  key: 'insertions' | 'deletions',
): number => files.reduce((total, file) => total + (file[key] ?? 0), 0);
