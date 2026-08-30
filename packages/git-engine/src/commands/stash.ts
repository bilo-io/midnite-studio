import type { GitOpResult, StashDropResult, StashEntry } from '@midnite/studio-shared';
import { conflict, failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { STASH_FORMAT, parseStashList } from '../parsers/stash-parser';
import { conflictedPaths } from './status';
import { gitErrorLine } from './worktree-ops';

/**
 * Stash: reads and writes in one module, since — unlike refs, which splits
 * `refs.ts`/`refs-ops.ts` — the domain here is small enough that a split
 * would just be two files importing each other's constants.
 */

export async function listStashes(worktreePath: string): Promise<StashEntry[]> {
  const res = await execGit(worktreePath, ['stash', 'list', '-z', `--format=${STASH_FORMAT}`]);
  if (res.exitCode !== 0) return [];
  return parseStashList(res.stdout);
}

export type StashPushOptions = {
  message?: string;
  keepIndex?: boolean;
  includeUntracked?: boolean;
  /** Scope the stash to these paths. Appended after `--`, which is why this
   *  command is `stash push` rather than the older `stash save`. */
  paths?: string[];
};

export async function stashPush(
  worktreePath: string,
  options: StashPushOptions = {},
): Promise<GitOpResult> {
  const { message, keepIndex = false, includeUntracked = false, paths } = options;

  const args = ['stash', 'push'];
  if (keepIndex) args.push('--keep-index');
  if (includeUntracked) args.push('-u');
  if (message !== undefined) args.push('-m', message);
  if (paths && paths.length > 0) args.push('--', ...paths);

  const res = await run(worktreePath, args);

  // Git treats "nothing to stash" as success (exit 0) and says so on STDOUT,
  // not stderr — there is no failing exit code to branch on here.
  if (/no local changes to save/i.test(res.stdout)) {
    return failure('There is nothing to stash.');
  }
  if (res.exitCode === 0) return ok();

  return failure(gitErrorLine(res.stderr) || 'Could not create the stash.', res.stderr);
}

/**
 * Apply or pop a stash entry.
 *
 * Exit code alone can't tell a conflict from a genuine failure — same rule
 * `runSequenced` in sequencer.ts follows — so a non-zero exit is checked
 * against `conflictedPaths()` before it's called an error. A conflicted pop
 * must not drop the stash, and it doesn't: that's git's own behaviour, not
 * something this function has to arrange.
 *
 * `conflictedPaths()` is read both before and after: unlike a merge or
 * rebase, a stash op can be attempted while the working tree already has
 * unrelated unmerged paths sitting in it (nothing about `stash pop` requires
 * a clean tree first), and diffing against the *before* snapshot is what
 * keeps a stale-selector failure (`stash@{5}: no such stash`) from being
 * misreported as a conflict on files this op never touched.
 */
async function applyOrPop(
  worktreePath: string,
  subcommand: 'apply' | 'pop',
  selector: string,
): Promise<GitOpResult> {
  const before = await conflictedPaths(worktreePath);
  const res = await run(worktreePath, ['stash', subcommand, selector]);
  if (res.exitCode === 0) return ok();

  const after = await conflictedPaths(worktreePath);
  const introduced = after.filter((path) => !before.includes(path));
  if (introduced.length > 0) return conflict('stash-apply', introduced);

  return failure(gitErrorLine(res.stderr) || `Could not ${subcommand} the stash.`, res.stderr);
}

export const stashApply = (worktreePath: string, selector: string): Promise<GitOpResult> =>
  applyOrPop(worktreePath, 'apply', selector);

export const stashPop = (worktreePath: string, selector: string): Promise<GitOpResult> =>
  applyOrPop(worktreePath, 'pop', selector);

/**
 * Drop a stash entry.
 *
 * `git stash drop` prints `Dropped <selector> (<sha>)` to STDOUT on success —
 * captured here before returning, so a dropped stash is unreachable, not
 * gone: the sha is an anchor a later `git stash store` can restore from.
 */
export async function stashDrop(
  worktreePath: string,
  selector: string,
): Promise<StashDropResult> {
  const res = await run(worktreePath, ['stash', 'drop', selector]);
  if (res.exitCode !== 0) {
    return failure(gitErrorLine(res.stderr) || 'Could not drop the stash.', res.stderr);
  }

  const recovered = /\(([0-9a-f]{40})\)/.exec(res.stdout);
  return recovered ? { ok: true, recoveredSha: recovered[1] } : { ok: true };
}

export async function stashBranch(
  worktreePath: string,
  branchName: string,
  selector: string,
): Promise<GitOpResult> {
  const res = await run(worktreePath, ['stash', 'branch', branchName, selector]);
  if (res.exitCode === 0) return ok();

  if (/already exists/i.test(res.stderr)) {
    return failure(`A branch named "${branchName}" already exists.`, res.stderr);
  }
  if (/not a valid (branch|object) name|is not a valid ref/i.test(res.stderr)) {
    return failure(`"${branchName}" is not a valid branch name.`, res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || 'Could not create the branch.', res.stderr);
}

const run = (worktreePath: string, args: string[]) =>
  writeQueue.run(worktreePath, () => execGit(worktreePath, args, { write: true }));
