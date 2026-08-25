import type { GitOpResult } from '@midnite/git-shared';
import { failure, ok } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { gitErrorLine } from './worktree-ops';

export type CommitOptions = {
  message: string;
  amend?: boolean;
  /** Stage every tracked modification first (`commit -a`). */
  all?: boolean;
};

/**
 * Create a commit.
 *
 * The message goes in over **stdin** (`commit -F -`), never as an argument.
 * A commit message is arbitrary user text — quotes, newlines, backticks, emoji,
 * a leading `-` — and `-m` would need escaping that is impossible to get right
 * across shells. stdin needs none.
 *
 * The user's `~/.gitconfig` applies unchanged, so `commit.gpgsign`, hooks,
 * `user.name`/`user.email` and `commit.template` all behave exactly as they do
 * in their terminal. That is the whole reason this shells out rather than
 * writing objects directly.
 */
export async function commit(
  worktreePath: string,
  options: CommitOptions,
): Promise<GitOpResult> {
  const args = ['commit', '-F', '-'];
  if (options.amend) args.push('--amend');
  if (options.all) args.push('--all');

  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, args, { write: true, stdin: options.message }),
  );

  if (res.exitCode === 0) return ok();
  return failure(describeCommitFailure(res.stdout, res.stderr), res.stderr || res.stdout);
}

/**
 * Git reports "nothing to commit" on **stdout**, not stderr, and exits 1.
 *
 * So the obvious `stderr || 'failed'` produces an empty, mystifying error for
 * by far the most common failure. A signing failure is the other one worth
 * naming: `gpg failed to sign` is opaque unless you already know what it means.
 */
function describeCommitFailure(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`;

  if (/nothing to commit|no changes added to commit/i.test(combined)) {
    return 'Nothing staged to commit.';
  }
  if (/Please tell me who you are|empty ident name/i.test(combined)) {
    return 'Git has no identity configured. Set user.name and user.email.';
  }
  if (/gpg failed to sign|failed to write commit object/i.test(combined)) {
    return 'Commit signing failed — check your signing key.';
  }
  if (/hook.*(declined|failed)|pre-commit/i.test(combined)) {
    return gitErrorLine(combined) || 'A commit hook rejected the commit.';
  }
  return gitErrorLine(stderr) || gitErrorLine(stdout) || 'Could not create the commit.';
}
