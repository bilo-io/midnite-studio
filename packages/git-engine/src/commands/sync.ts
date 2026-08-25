import type { GitOpResult } from '@midnite-git/shared';
import { failure, ok } from '@midnite-git/shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { conflictedPaths } from './status';
import { gitErrorLine } from './worktree-ops';

/**
 * Fetch, pull and push.
 *
 * These are the only commands here that touch the network, and they do it
 * through the user's own credential setup: the CLI inherits their credential
 * helper, SSH agent and `~/.gitconfig` because we never override `HOME`. That
 * is a large part of why the engine shells out at all — no token storage, no
 * SSH key handling, no keychain integration to write.
 *
 * `GIT_TERMINAL_PROMPT=0` (set for every invocation in git-exec) is what makes
 * that safe: with no terminal attached, a credential prompt would otherwise
 * block forever and the UI would spin with no way to answer. Instead auth
 * failures come back immediately as errors.
 *
 * There is **no force-push** here, and no `force` parameter to add one through.
 * When it lands post-MVP it will be `--force-with-lease` behind blast-radius
 * gating, as its own command.
 */

export type FetchOptions = { remote?: string; prune?: boolean };

export async function fetch(worktreePath: string, options: FetchOptions = {}): Promise<GitOpResult> {
  const args = ['fetch', options.remote ?? '--all'];
  if (options.prune ?? true) args.push('--prune');
  // Tags are not fetched by default for a named remote's non-branch refs;
  // the graph badges them, so fetch them.
  args.push('--tags');

  const res = await run(worktreePath, args);
  return res.exitCode === 0 ? ok() : failure(describeNetworkFailure(res.stderr), res.stderr);
}

export type PullOptions = { remote?: string; branch?: string; rebase?: boolean };

/**
 * Pull.
 *
 * `--no-rebase`/`--rebase` is always passed explicitly rather than left to
 * `pull.rebase`: which one runs changes the shape of the resulting history, and
 * a button whose behaviour depends on invisible config is a button nobody can
 * trust. The UI decides and says so.
 *
 * A conflicted pull is a normal outcome, not an error — it comes back as the
 * conflict arm so the UI can show the banner and offer abort/continue.
 */
export async function pull(worktreePath: string, options: PullOptions = {}): Promise<GitOpResult> {
  const args = ['pull', options.rebase ? '--rebase' : '--no-rebase'];
  if (options.remote) args.push(options.remote);
  if (options.branch) args.push(options.branch);

  const res = await run(worktreePath, args);
  if (res.exitCode === 0) return ok();

  const files = await conflictedPaths(worktreePath);
  if (files.length > 0) {
    return {
      ok: false,
      kind: 'conflict',
      op: options.rebase ? 'rebase' : 'merge',
      files,
    };
  }

  return failure(describeNetworkFailure(res.stderr), res.stderr);
}

export type PushOptions = {
  remote?: string;
  branch?: string;
  /** `-u` for a branch that has no upstream yet. */
  setUpstream?: boolean;
  tags?: boolean;
};

export async function push(worktreePath: string, options: PushOptions = {}): Promise<GitOpResult> {
  const args = ['push'];
  if (options.setUpstream) args.push('--set-upstream');
  if (options.tags) args.push('--tags');
  if (options.remote) args.push(options.remote);
  if (options.branch) args.push(options.branch);

  const res = await run(worktreePath, args);
  return res.exitCode === 0 ? ok() : failure(describePushFailure(res.stderr), res.stderr);
}

const run = (worktreePath: string, args: string[]) =>
  writeQueue.run(worktreePath, () =>
    execGit(worktreePath, args, {
      write: true,
      // Network ops are slow and their progress goes to stderr; the default
      // buffer is ample, but a large fetch's progress output is not.
      maxBuffer: 32 * 1024 * 1024,
    }),
  );

/**
 * Map git's transport errors onto something that says what to do.
 *
 * The auth cases matter most: with `GIT_TERMINAL_PROMPT=0` git's own message is
 * "could not read Username for 'https://…': terminal prompts disabled", which
 * describes our configuration rather than the user's problem.
 */
function describeNetworkFailure(stderr: string): string {
  if (/terminal prompts disabled|could not read Username|Authentication failed/i.test(stderr)) {
    return 'Authentication failed. Check your credential helper or SSH key for this remote.';
  }
  if (/Permission denied \(publickey\)/i.test(stderr)) {
    return 'The remote refused your SSH key (permission denied).';
  }
  if (/Could not resolve host|Network is unreachable|Connection refused|Failed to connect/i.test(stderr)) {
    return 'Could not reach the remote. Check your network connection.';
  }
  if (/does not appear to be a git repository|Repository not found/i.test(stderr)) {
    return 'The remote does not exist, or you do not have access to it.';
  }
  if (/no such remote|No configured push destination|does not have a remote/i.test(stderr)) {
    return 'This branch has no remote configured.';
  }
  if (/You have divergent branches/i.test(stderr)) {
    return 'Your branch and its upstream have diverged.';
  }
  return gitErrorLine(stderr) || 'The remote operation failed.';
}

function describePushFailure(stderr: string): string {
  if (/non-fast-forward|fetch first|Updates were rejected/i.test(stderr)) {
    // The single most common push failure. Naming the fix matters, and the fix
    // is emphatically NOT a force push — which the MVP does not offer at all.
    return 'The remote has commits you do not. Pull first, then push again.';
  }
  if (/has no upstream branch/i.test(stderr)) {
    return 'This branch has no upstream yet. Push with "set upstream" to create one.';
  }
  if (/protected branch|pre-receive hook declined|refusing to/i.test(stderr)) {
    return gitErrorLine(stderr) || 'The remote rejected the push.';
  }
  return describeNetworkFailure(stderr);
}
