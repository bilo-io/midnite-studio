import type { GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';

/**
 * Worktree creation and removal.
 *
 * Both go through the write queue: `worktree add` writes `.git/worktrees/<name>`
 * and a ref, `worktree remove` deletes them, and either racing a concurrent
 * commit means a lock error the user can do nothing about.
 */

export type WorktreeAddOptions = {
  path: string;
  branch: string;
  createBranch: boolean;
  startPoint?: string;
};

export async function addWorktree(
  repoPath: string,
  options: WorktreeAddOptions,
): Promise<GitOpResult> {
  const args = ['worktree', 'add'];
  if (options.createBranch) args.push('-b', options.branch);
  args.push(options.path);
  // With `-b` the branch is created at this start point; without it, the
  // positional commit-ish IS the branch to check out.
  if (options.createBranch) {
    if (options.startPoint) args.push(options.startPoint);
  } else {
    args.push(options.branch);
  }

  const res = await writeQueue.run(repoPath, () =>
    execGit(repoPath, args, { write: true }),
  );

  if (res.exitCode === 0) return ok();
  return failure(describeWorktreeAddFailure(res.stderr, options), res.stderr);
}

/**
 * Remove a linked worktree.
 *
 * `force` is passed through but the UI only ever sets it after an explicit
 * confirmation: without `--force` git refuses to remove a worktree with
 * uncommitted changes, and that refusal is a feature — it is the last thing
 * standing between a stray click and lost work.
 */
export async function removeWorktree(
  repoPath: string,
  path: string,
  force = false,
): Promise<GitOpResult> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);

  const res = await writeQueue.run(repoPath, () => execGit(repoPath, args, { write: true }));
  if (res.exitCode === 0) return ok();

  if (/contains modified or untracked files/i.test(res.stderr)) {
    return failure(
      'This worktree has uncommitted changes. Removing it would discard them.',
      res.stderr,
    );
  }
  return failure(gitErrorLine(res.stderr) || 'Could not remove the worktree.', res.stderr);
}

/** Map git's stderr onto something that names the actual problem. */
function describeWorktreeAddFailure(stderr: string, options: WorktreeAddOptions): string {
  if (/a branch named .* already exists/i.test(stderr)) {
    return `A branch named "${options.branch}" already exists.`;
  }
  // The single most common failure, and git's own wording buries the reason.
  // Two phrasings because git changed it: 2.43 (what dugite bundles) says
  // "is already used by worktree at", newer builds say "is already checked out
  // at". Matching only one silently degrades to the generic message on the
  // other, which is the version half our users have.
  if (/already (used by worktree|checked out) at/i.test(stderr)) {
    return `"${options.branch}" is already checked out in another worktree. A branch can only be checked out once.`;
  }
  if (/already exists/i.test(stderr)) {
    return `"${options.path}" already exists.`;
  }
  return gitErrorLine(stderr) || 'Could not create the worktree.';
}

/**
 * The line that actually says what went wrong.
 *
 * `git worktree add` writes progress to stderr *before* the error
 * ("Preparing worktree (checking out 'main')"), so taking the first non-empty
 * line reports the progress note as the failure. Prefer a `fatal:`/`error:`
 * line and only fall back to the first line when there isn't one.
 */
export function gitErrorLine(text: string): string {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const fatal = lines.find((line) => /^(fatal|error):/i.test(line));
  return (fatal ?? lines[0] ?? '').replace(/^(fatal|error):\s*/i, '');
}
