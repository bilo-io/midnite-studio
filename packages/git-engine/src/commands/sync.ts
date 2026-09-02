import type { GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

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
 * **Force-push is `--force-with-lease` only, never bare `--force`** (Phase 22
 * Theme F). There is still no way to build a bare `--force` from `PushOptions`
 * — `forceWithLease` is the only escape hatch this module offers, and it
 * always carries an explicit `ref:expect` pair rather than a boolean, so a
 * caller cannot lease against whatever the local remote-tracking ref happens
 * to say right now (which a background fetch can silently refresh). The
 * app-side gating — the Settings opt-in, the blast-radius confirm, offering
 * it only after a plain push was rejected as non-fast-forward — lives above
 * this module; this layer only refuses to build the dangerous, argument-less
 * form.
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
  /**
   * `--force-with-lease=<ref>:<expect>` — the only force-push this module
   * builds, and only in this explicit `ref:expect` form. See the module
   * header for why a bare boolean is never offered.
   */
  forceWithLease?: { ref: string; expect: string };
};

export async function push(worktreePath: string, options: PushOptions = {}): Promise<GitOpResult> {
  const args = ['push'];
  if (options.setUpstream) args.push('--set-upstream');
  if (options.tags) args.push('--tags');
  if (options.forceWithLease) {
    args.push(`--force-with-lease=${options.forceWithLease.ref}:${options.forceWithLease.expect}`);
  }
  if (options.remote) args.push(options.remote);
  if (options.branch) args.push(options.branch);

  const res = await run(worktreePath, args);
  return res.exitCode === 0
    ? ok()
    : failure(describePushFailure(res.stderr, !!options.forceWithLease), res.stderr, pushFailureCode(res.stderr, !!options.forceWithLease));
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

/**
 * A rejected `--force-with-lease` is its own outcome, not a generic
 * non-fast-forward — the fix is emphatically not "push again," it is "fetch
 * and look, because the lease you had is stale." Only checked when the push
 * itself carried a lease: the same `(stale info)` marker cannot appear in a
 * plain push's stderr, since a plain push never sends `--force-with-lease`
 * for git to reject against.
 */
function describePushFailure(stderr: string, wasForceWithLease: boolean): string {
  if (wasForceWithLease && /\(stale info\)/i.test(stderr)) {
    return 'Someone else pushed to this branch since you last fetched. Fetch and look before forcing.';
  }
  if (/non-fast-forward|fetch first|Updates were rejected/i.test(stderr)) {
    // The single most common push failure. Naming the fix matters — pull
    // first, not force: force-with-lease exists (Phase 22 Theme F) but is
    // reached through its own gated entry point, never suggested here.
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

function pushFailureCode(
  stderr: string,
  wasForceWithLease: boolean,
): 'non-fast-forward' | 'stale-lease' | undefined {
  if (wasForceWithLease && /\(stale info\)/i.test(stderr)) return 'stale-lease';
  if (/non-fast-forward|fetch first|Updates were rejected/i.test(stderr)) return 'non-fast-forward';
  return undefined;
}
