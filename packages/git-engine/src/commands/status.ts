import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { InProgressOp, StatusResult } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { parseStatus } from '../parsers/status-parser';

/**
 * Working-tree status for one checkout.
 *
 * `--untracked-files=all` rather than the default `normal`: `normal` collapses
 * an untracked directory to a single entry, so the changes list would show
 * `src/new-feature/` instead of the files inside it and staging one file at a
 * time would be impossible.
 *
 * `--ignored=no` is the default and stays that way — enumerating ignored files
 * on a repo with a big `node_modules` costs seconds.
 */
export async function getStatus(worktreePath: string): Promise<StatusResult> {
  const res = await execGit(worktreePath, [
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '-z',
  ]);

  const status = parseStatus(res.exitCode === 0 ? res.stdout : '');
  return { ...status, inProgress: await detectInProgress(worktreePath) };
}

/**
 * Which multi-commit operation, if any, git has paused mid-way.
 *
 * Detected from `.git` state files rather than from status output, because
 * status doesn't report it in porcelain format at all. The paths are resolved
 * through `rev-parse --git-path`, which is what makes this work inside a linked
 * worktree — there `.git` is a *file* and the real state lives under
 * `…/.git/worktrees/<name>/`, so a hardcoded `<root>/.git/MERGE_HEAD` would
 * always miss.
 *
 * Order matters: a rebase that hits a conflict while applying a commit also has
 * a `CHERRY_PICK_HEAD` in some git versions, so rebase is checked first.
 */
export async function detectInProgress(worktreePath: string): Promise<InProgressOp | null> {
  const gitDir = await resolveGitDir(worktreePath);
  if (!gitDir) return null;

  const exists = async (relative: string): Promise<boolean> => {
    try {
      await access(join(gitDir, relative));
      return true;
    } catch {
      return false;
    }
  };

  // `rebase-merge` covers both interactive and merge-backend rebases; the old
  // `rebase-apply` directory is the am-backend one (and `git am` itself).
  if ((await exists('rebase-merge')) || (await exists('rebase-apply'))) return 'rebase';
  if (await exists('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (await exists('REVERT_HEAD')) return 'revert';
  if (await exists('MERGE_HEAD')) return 'merge';
  return null;
}

/** Absolute `.git` directory for this checkout — the linked-worktree one, if any. */
async function resolveGitDir(worktreePath: string): Promise<string | null> {
  const res = await execGit(worktreePath, ['rev-parse', '--path-format=absolute', '--git-dir']);
  if (res.exitCode !== 0) return null;
  const dir = res.stdout.trim();
  return dir.length > 0 ? dir : null;
}

/**
 * Paths git currently considers unmerged, for the conflict envelope.
 *
 * `diff --name-only --diff-filter=U` rather than re-reading status: it's a
 * single narrow call and it's the same list git's own `--continue` gate uses.
 */
export async function conflictedPaths(worktreePath: string): Promise<string[]> {
  const res = await execGit(worktreePath, ['diff', '--name-only', '--diff-filter=U', '-z']);
  if (res.exitCode !== 0) return [];
  return res.stdout.split('\x00').filter((p) => p.length > 0);
}

/**
 * The commit message git staged for an in-progress merge, so the commit box can
 * be prefilled after conflicts are resolved.
 */
export async function inProgressMessage(worktreePath: string): Promise<string | null> {
  const gitDir = await resolveGitDir(worktreePath);
  if (!gitDir) return null;
  try {
    return await readFile(join(gitDir, 'MERGE_MSG'), 'utf8');
  } catch {
    return null;
  }
}
