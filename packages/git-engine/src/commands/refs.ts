import type { Ref } from '@midnite-git/shared';

import { execGit } from '../exec/git-exec';
import { FOR_EACH_REF_FORMAT, parseRefs } from '../parsers/refs-parser';

/**
 * Every branch and tag in the repo, in one `for-each-ref` call.
 *
 * One call rather than `branch -v` + `tag -l` + `branch -r`: those three print
 * three different formats, none of which carries the upstream track or the
 * worktree path, and each is another process spawn on a hot path (the watcher
 * re-reads refs on every ref change).
 */
export async function listRefs(repoPath: string): Promise<Ref[]> {
  const res = await execGit(repoPath, [
    'for-each-ref',
    `--format=${FOR_EACH_REF_FORMAT}`,
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);

  if (res.exitCode !== 0) return [];
  return parseRefs(res.stdout);
}

/**
 * The short name of the branch HEAD points at, or null when detached.
 *
 * `symbolic-ref --short HEAD` exits non-zero on a detached HEAD *and* in an
 * unborn repo, which is exactly the "no current branch" answer — no need to
 * distinguish them here.
 */
export async function currentBranch(repoPath: string): Promise<string | null> {
  const res = await execGit(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (res.exitCode !== 0) return null;
  const name = res.stdout.trim();
  return name.length > 0 ? name : null;
}
