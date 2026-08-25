import type { GitOpResult } from '@midnite/git-shared';
import { failure, ok } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { gitErrorLine } from './worktree-ops';

/**
 * Ref manipulation: checkout, branch create/delete/rename, tag create, reset.
 *
 * The error mapping is the substance of this file. Git's refusals here are
 * usually *correct* and protective — a dirty tree, a branch checked out
 * elsewhere, an unmerged branch — but its wording assumes you already know the
 * model. Each one is translated into a sentence that says what happened and
 * what to do, because these are the messages a user meets when the app stops
 * them doing something.
 */

export type CheckoutOptions = { target: string; detach?: boolean };

export async function checkout(
  worktreePath: string,
  options: CheckoutOptions,
): Promise<GitOpResult> {
  const args = ['checkout'];
  if (options.detach) args.push('--detach');
  args.push(options.target);

  const res = await run(worktreePath, args);
  return res.exitCode === 0 ? ok() : failure(describeCheckoutFailure(res.stderr, options.target), res.stderr);
}

export type BranchCreateOptions = { name: string; startPoint: string; checkout?: boolean };

export async function createBranch(
  worktreePath: string,
  options: BranchCreateOptions,
): Promise<GitOpResult> {
  // `checkout -b` rather than `branch` + `checkout`: one command, one lock, and
  // no window where the branch exists but the tree hasn't moved.
  const args = options.checkout
    ? ['checkout', '-b', options.name, options.startPoint]
    : ['branch', options.name, options.startPoint];

  const res = await run(worktreePath, args);
  if (res.exitCode === 0) return ok();

  if (/already exists/i.test(res.stderr)) {
    return failure(`A branch named "${options.name}" already exists.`, res.stderr);
  }
  if (/not a valid (branch|object) name|is not a valid ref/i.test(res.stderr)) {
    return failure(`"${options.name}" is not a valid branch name.`, res.stderr);
  }
  return failure(describeCheckoutFailure(res.stderr, options.name), res.stderr);
}

export type BranchDeleteOptions = { name: string; force?: boolean };

/**
 * Delete a branch.
 *
 * Without `force` git refuses to delete an unmerged branch, and that refusal is
 * a feature: the commits become unreachable and only the reflog stands between
 * the user and losing them. The UI only sets `force` after showing how many
 * commits the deletion orphans (see `countOrphanedCommits`).
 */
export async function deleteBranch(
  worktreePath: string,
  options: BranchDeleteOptions,
): Promise<GitOpResult> {
  const res = await run(worktreePath, ['branch', options.force ? '-D' : '-d', options.name]);
  if (res.exitCode === 0) return ok();

  if (/not fully merged/i.test(res.stderr)) {
    return failure(
      `"${options.name}" has commits that are not merged anywhere else. Deleting it would orphan them.`,
      res.stderr,
    );
  }
  if (/checked out at|used by worktree/i.test(res.stderr)) {
    return failure(
      `"${options.name}" is checked out in a worktree. Switch away from it first.`,
      res.stderr,
    );
  }
  return failure(gitErrorLine(res.stderr) || 'Could not delete the branch.', res.stderr);
}

export async function renameBranch(
  worktreePath: string,
  from: string,
  to: string,
): Promise<GitOpResult> {
  const res = await run(worktreePath, ['branch', '-m', from, to]);
  if (res.exitCode === 0) return ok();
  if (/already exists/i.test(res.stderr)) {
    return failure(`A branch named "${to}" already exists.`, res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || 'Could not rename the branch.', res.stderr);
}

export type TagCreateOptions = { name: string; target: string; message?: string };

export async function createTag(
  worktreePath: string,
  options: TagCreateOptions,
): Promise<GitOpResult> {
  // With a message it's an annotated tag (its own object, signable, dated);
  // without one it's a lightweight ref. The message decides, so the UI doesn't
  // need a separate toggle.
  const args = options.message
    ? ['tag', '-a', '-F', '-', options.name, options.target]
    : ['tag', options.name, options.target];

  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, args, {
      write: true,
      ...(options.message === undefined ? {} : { stdin: options.message }),
    }),
  );

  if (res.exitCode === 0) return ok();
  if (/already exists/i.test(res.stderr)) {
    return failure(`A tag named "${options.name}" already exists.`, res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || 'Could not create the tag.', res.stderr);
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

/**
 * Move the current branch to another commit.
 *
 * `hard` is the most destructive thing this app can do: it discards working-tree
 * changes with no reflog to recover them, on top of moving the branch. The UI
 * gates it behind a confirmation showing both the orphaned-commit count and the
 * fact that uncommitted work will go.
 */
export async function reset(
  worktreePath: string,
  target: string,
  mode: ResetMode,
): Promise<GitOpResult> {
  const res = await run(worktreePath, ['reset', `--${mode}`, target]);
  if (res.exitCode === 0) return ok();
  if (/unknown revision|ambiguous argument/i.test(res.stderr)) {
    return failure(`"${target}" is not a commit in this repository.`, res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || 'Could not reset.', res.stderr);
}

export type BlastRadiusQuery = {
  /** The tip whose history is at risk — `HEAD` for a reset, the branch for a delete. */
  from: string;
  /** Where the ref ends up. Omitted for a delete, where it ends up nowhere. */
  to?: string;
  /**
   * The ref being moved or deleted, fully qualified (`refs/heads/main`).
   *
   * It must be excluded from the "still reachable from somewhere" set, because
   * before the operation it is precisely what keeps these commits alive.
   */
  movingRef?: string;
};

/**
 * How many commits an operation would leave unreachable from ANY ref.
 *
 * The naive version — `rev-list --count to..from` — is what a first pass
 * reaches for, and it *overstates* the damage: a commit on the range that is
 * also on another branch is not orphaned at all. Telling someone "2 commits
 * will be orphaned" when one of them is safely on `feature` is exactly the kind
 * of wrong number that teaches users to click through safety dialogs without
 * reading them.
 *
 * So the real question is asked instead: reachable from `from`, not reachable
 * from `to`, and not reachable from any ref *other than the one being moved*.
 * Refs go in over stdin because a repo with hundreds of remote branches would
 * otherwise blow the argv limit.
 */
export async function countOrphanedCommits(
  worktreePath: string,
  query: BlastRadiusQuery,
): Promise<{ count: number; sample: { sha: string; subject: string }[] }> {
  const refs = await execGit(worktreePath, ['for-each-ref', '--format=%(refname)']);
  if (refs.exitCode !== 0) return { count: 0, sample: [] };

  const exclusions = refs.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && name !== query.movingRef)
    .map((name) => `^${name}`);

  const revs = [query.from, ...(query.to ? [`^${query.to}`] : []), ...exclusions].join('\n');

  const listed = await execGit(
    worktreePath,
    ['rev-list', '--max-count=200', '--pretty=format:%H%x00%s', '--no-commit-header', '--stdin'],
    { stdin: `${revs}\n` },
  );
  if (listed.exitCode !== 0) return { count: 0, sample: [] };

  const commits = listed.stdout
    .split('\n')
    .map((line) => line.split('\x00'))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts[0]!.length === 40)
    .map(([sha, subject]) => ({ sha, subject }));

  return { count: commits.length, sample: commits.slice(0, 5) };
}

/**
 * Translate git's checkout refusals.
 *
 * The dirty-tree case is the one that matters: git prints a multi-line list of
 * files followed by "Please commit your changes or stash them", and surfacing
 * only the first line ("error: Your local changes to the following files would
 * be overwritten by checkout:") tells the user nothing about what to do.
 */
function describeCheckoutFailure(stderr: string, target: string): string {
  if (/local changes to the following files would be overwritten/i.test(stderr)) {
    return 'You have uncommitted changes that this checkout would overwrite. Commit or discard them first.';
  }
  if (/already checked out at|already used by worktree/i.test(stderr)) {
    return `"${target}" is checked out in another worktree. A branch can only be checked out once.`;
  }
  if (/did not match any file\(s\) known to git|pathspec .* did not match/i.test(stderr)) {
    return `"${target}" is not a branch, tag or commit in this repository.`;
  }
  if (/you need to resolve your current index first|unmerged files/i.test(stderr)) {
    return 'Resolve the current conflict before switching.';
  }
  return gitErrorLine(stderr) || 'Could not switch to that ref.';
}

const run = (worktreePath: string, args: string[]) =>
  writeQueue.run(worktreePath, () => execGit(worktreePath, args, { write: true }));
