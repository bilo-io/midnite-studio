import type { ConflictOp, GitOpResult, InProgressOp } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { conflictedPaths, detectInProgress } from './status';
import { gitErrorLine } from './worktree-ops';

/**
 * The multi-commit operations git can pause in the middle of, and the
 * abort/continue controls that get you out.
 *
 * This is the file that makes conflicts ordinary. A merge or rebase that stops
 * on a conflict has NOT failed — git has done exactly what it should and is
 * waiting for a human. Modelling that as an exception would push it through the
 * error path, where the UI would show a red toast and no way forward. It comes
 * back as `GitOpResult`'s conflict arm instead, carrying the files, and the
 * conflict banner takes over.
 */

/**
 * Run an operation that might stop on a conflict.
 *
 * The exit code alone can't tell the two apart: `git merge` exits 1 both for a
 * conflict and for "not something we can merge". So after any non-zero exit we
 * ask git what state the worktree is actually in — if there are unmerged paths
 * and an operation in progress, it's a conflict.
 */
async function runSequenced(
  worktreePath: string,
  args: string[],
  op: ConflictOp,
  describeError: (stderr: string, stdout: string) => string,
): Promise<GitOpResult> {
  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, args, { write: true }),
  );

  if (res.exitCode === 0) return ok();

  const files = await conflictedPaths(worktreePath);
  if (files.length > 0) return { ok: false, kind: 'conflict', op, files };

  // No unmerged paths but git still stopped: a genuine failure. Clean up any
  // half-started state so the user isn't left in a sequencer they never chose.
  const inProgress = await detectInProgress(worktreePath);
  if (inProgress !== null) await abort(worktreePath, inProgress);

  return failure(describeError(res.stderr, res.stdout), res.stderr || res.stdout);
}

export type MergeOptions = { source: string; noFastForward?: boolean };

export async function merge(
  worktreePath: string,
  options: MergeOptions,
): Promise<GitOpResult> {
  const args = ['merge', options.noFastForward ? '--no-ff' : '--ff'];
  // `--no-edit` so a merge commit never opens the user's $EDITOR — there is no
  // terminal attached, and git would block forever waiting for one to close.
  args.push('--no-edit', options.source);

  return runSequenced(worktreePath, args, 'merge', (stderr) => {
    if (/not something we can merge|not a valid object name/i.test(stderr)) {
      return `"${options.source}" is not a branch or commit that can be merged.`;
    }
    if (/local changes to the following files would be overwritten|Your local changes/i.test(stderr)) {
      return 'You have uncommitted changes that this merge would overwrite. Commit or discard them first.';
    }
    if (/refusing to merge unrelated histories/i.test(stderr)) {
      return `"${options.source}" shares no history with this branch.`;
    }
    if (/Already up to date/i.test(stderr)) return 'Already up to date.';
    return gitErrorLine(stderr) || 'The merge failed.';
  });
}

export type RebaseOptions = { onto: string };

export async function rebase(
  worktreePath: string,
  options: RebaseOptions,
): Promise<GitOpResult> {
  return runSequenced(worktreePath, ['rebase', options.onto], 'rebase', (stderr) => {
    if (/cannot rebase: You have unstaged changes|cannot pull with rebase/i.test(stderr)) {
      return 'You have uncommitted changes. Commit or discard them before rebasing.';
    }
    if (/invalid upstream|does not point to a valid commit/i.test(stderr)) {
      return `"${options.onto}" is not a branch or commit to rebase onto.`;
    }
    return gitErrorLine(stderr) || 'The rebase failed.';
  });
}

/**
 * Cherry-pick one or more commits.
 *
 * Passed as a single invocation rather than a loop: git's sequencer then owns
 * the whole run, so a conflict on the third commit leaves the first two applied
 * and `--continue` resumes from exactly there. Looping would leave us to
 * reimplement that bookkeeping, badly.
 */
export async function cherryPick(worktreePath: string, shas: string[]): Promise<GitOpResult> {
  if (shas.length === 0) return ok();

  // Oldest first — cherry-picking newest-first would apply changes in reverse
  // order and conflict against itself. The graph hands them over top-down.
  const ordered = [...shas].reverse();

  return runSequenced(worktreePath, ['cherry-pick', ...ordered], 'cherry-pick', (stderr) => {
    if (/bad revision|not a valid object name/i.test(stderr)) {
      return 'One of those commits is not in this repository.';
    }
    if (/The previous cherry-pick is now empty/i.test(stderr)) {
      return 'That change is already on this branch.';
    }
    if (/your local changes would be overwritten/i.test(stderr)) {
      return 'You have uncommitted changes that this cherry-pick would overwrite.';
    }
    return gitErrorLine(stderr) || 'The cherry-pick failed.';
  });
}

/**
 * Abandon an in-progress operation and put the worktree back as it was.
 *
 * `--abort` is git's own restore path and is reliable — which is why the
 * conflict banner keeps it visible at all times. A user who is lost in a
 * conflict must always be one click from the state they started in.
 */
export async function abort(worktreePath: string, op: InProgressOp): Promise<GitOpResult> {
  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, [SUBCOMMAND[op], '--abort'], { write: true }),
  );
  return res.exitCode === 0
    ? ok()
    : failure(gitErrorLine(res.stderr) || `Could not abort the ${op}.`, res.stderr);
}

/**
 * Carry on after the conflicts are resolved.
 *
 * Refuses up front while anything is still unmerged: git's own message for that
 * ("you must edit all merge conflicts") is fine, but catching it here means the
 * UI can keep the Continue button disabled and explain, rather than letting the
 * user click into an error.
 *
 * `GIT_EDITOR=true` because `--continue` opens the commit-message editor by
 * default. With no terminal attached that would hang forever.
 */
export async function continueOp(worktreePath: string, op: InProgressOp): Promise<GitOpResult> {
  const unresolved = await conflictedPaths(worktreePath);
  if (unresolved.length > 0) {
    return {
      ok: false,
      kind: 'conflict',
      op: op === 'revert' ? 'revert' : op,
      files: unresolved,
    };
  }

  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, [SUBCOMMAND[op], '--continue'], {
      write: true,
      env: { GIT_EDITOR: 'true' },
    }),
  );

  if (res.exitCode === 0) return ok();

  // `--continue` can itself hit the NEXT conflict in a multi-commit rebase or
  // cherry-pick; that's progress, not failure.
  const files = await conflictedPaths(worktreePath);
  if (files.length > 0) {
    return { ok: false, kind: 'conflict', op: op === 'revert' ? 'revert' : op, files };
  }

  if (/nothing to commit|no changes/i.test(`${res.stdout}${res.stderr}`)) {
    // The resolution amounted to "take what's already here" — skip and move on.
    const skipped = await writeQueue.run(worktreePath, () =>
      execGit(worktreePath, [SUBCOMMAND[op], '--skip'], { write: true }),
    );
    if (skipped.exitCode === 0) return ok();
  }

  return failure(gitErrorLine(res.stderr) || `Could not continue the ${op}.`, res.stderr);
}

/** `git <subcommand> --abort/--continue` per in-progress state. */
const SUBCOMMAND: Record<InProgressOp, string> = {
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
};
