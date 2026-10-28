import type { CommitDiffStat } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { COMMIT_NUMSTAT_ARGS, parseCommitNumstat } from '../parsers/numstat-parser';

/**
 * Diff stats for a batch of commits — one `git log --no-walk --numstat`, not
 * one process per sha.
 *
 * Read with the inspector's own numstat flags and parser (see
 * `COMMIT_NUMSTAT_ARGS`), so each stat is the sum of the files `readCommitDetail`
 * lists for that commit: renames count once, binaries count as a file with no
 * lines, and a merge is measured against its first parent.
 *
 * One sha git cannot resolve fails the whole `git log` (exit 128), so on a
 * failed batch each sha is read alone: the bad one is absent from the result
 * and the rest of the page still gets its numbers.
 */
export async function readCommitStats(
  repoPath: string,
  shas: readonly string[],
): Promise<Record<string, CommitDiffStat>> {
  if (shas.length === 0) return {};
  const batch = await readBatch(repoPath, shas);
  if (batch !== null || shas.length === 1) return batch ?? {};
  const singles = await Promise.all(shas.map((sha) => readBatch(repoPath, [sha])));
  return Object.assign({}, ...singles.filter((single) => single !== null));
}

async function readBatch(
  repoPath: string,
  shas: readonly string[],
): Promise<Record<string, CommitDiffStat> | null> {
  const res = await execGit(repoPath, [
    'log',
    '--no-walk=unsorted',
    ...COMMIT_NUMSTAT_ARGS,
    '--format=%x01%H%x00%P%x00',
    ...shas,
    '--',
  ]);
  if (res.exitCode !== 0) return null;
  return Object.fromEntries(parseCommitNumstat(res.stdout));
}
