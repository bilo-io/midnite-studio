import type { Worktree } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { parseWorktrees } from '../parsers/worktree-parser';

/**
 * Every checkout of the repo, main worktree first.
 *
 * `--porcelain` (not `-z`, which git only added for this subcommand in 2.36 and
 * which dugite's bundled 2.43 supports but older system gits may not) — the
 * record format is line-based and ref names can't contain newlines. Paths could
 * in principle, but git itself cannot create a worktree at such a path.
 */
export async function listWorktrees(repoPath: string, repoId: string): Promise<Worktree[]> {
  const res = await execGit(repoPath, ['worktree', 'list', '--porcelain']);
  if (res.exitCode !== 0) return [];
  return parseWorktrees(res.stdout, repoId);
}
