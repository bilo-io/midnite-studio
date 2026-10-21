import type { CommitDiffStat } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { parseCommitNumstat } from '../parsers/numstat-parser';

/**
 * Diff stats for a batch of commits — one `git log --no-walk --numstat`, not
 * one process per sha. Shas missing from the repository are simply absent from
 * the result; merges are `null` (see `parseCommitNumstat`).
 */
export async function readCommitStats(
  repoPath: string,
  shas: readonly string[],
): Promise<Record<string, CommitDiffStat | null>> {
  if (shas.length === 0) return {};
  const res = await execGit(repoPath, [
    'log',
    '--no-walk=unsorted',
    '--numstat',
    '-z',
    '--no-renames',
    '--format=%x01%H%x00%P%x00',
    ...shas,
    '--',
  ]);
  if (res.exitCode !== 0) return {};
  return Object.fromEntries(parseCommitNumstat(res.stdout));
}
