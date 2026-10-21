import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { gitErrorLine } from './worktree-ops';

export type InitRepoOptions = {
  /** The initial commit's message. Goes in over stdin, never as an argument. */
  message: string;
  /** Pins the commit's author and committer; otherwise the user's git config applies. */
  author?: { name: string; email: string };
};

/**
 * `git init -b main`, then one commit of whatever is in `dir` — Phase 107's
 * game repos are the first production `git init` in the app.
 *
 * Runs inside the per-repo write queue like every other git write, so a
 * file-watcher refresh racing the first `git add` cannot trip `index.lock`.
 *
 * `--no-verify`: a brand new repo has no hooks of its own, so any hook that
 * fires would be the user's global `core.hooksPath` — which belongs to *their*
 * projects, not to a scaffold the app just wrote. `--no-gpg-sign` for the same
 * reason: a passphrase prompt would hang the create flow. Identity still
 * follows the user's git config; no identity configured anywhere returns the
 * commit's own failure message.
 */
export async function initRepo(dir: string, opts: InitRepoOptions): Promise<GitOpResult<{ head: string }>> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    return failure(`Could not create ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (await pathExists(join(dir, '.git'))) return failure('This folder is already a git repository.');

  const env = opts.author
    ? {
        GIT_AUTHOR_NAME: opts.author.name,
        GIT_AUTHOR_EMAIL: opts.author.email,
        GIT_COMMITTER_NAME: opts.author.name,
        GIT_COMMITTER_EMAIL: opts.author.email,
      }
    : undefined;

  return writeQueue.run(dir, async (): Promise<GitOpResult<{ head: string }>> => {
    const init = await execGit(dir, ['init', '--initial-branch=main', '--', '.'], { write: true });
    if (init.exitCode !== 0) return failure(gitErrorLine(init.stderr) || 'Could not initialise the repository.', init.stderr);

    // Not `stagePaths`: that takes the write queue itself, and this task is
    // already inside it — a nested `run` on the same key would wait on itself.
    const staged = await execGit(dir, ['add', '--', '.'], { write: true });
    if (staged.exitCode !== 0) return failure(gitErrorLine(staged.stderr) || 'Could not stage the scaffold.', staged.stderr);

    const commit = await execGit(dir, ['commit', '--no-verify', '--no-gpg-sign', '-F', '-'], {
      write: true,
      stdin: opts.message,
      ...(env ? { env } : {}),
    });
    if (commit.exitCode !== 0) {
      const combined = `${commit.stdout}\n${commit.stderr}`;
      return failure(
        gitErrorLine(commit.stderr) || gitErrorLine(commit.stdout) || 'Could not create the first commit.',
        combined,
      );
    }

    const head = await execGit(dir, ['rev-parse', 'HEAD'], { write: true });
    return ok({ head: head.stdout.trim() });
  });
}

/**
 * Whether `path` is inside a git working tree. `false` on any error — a path
 * that does not exist yet, or no git at all, is "not inside one".
 */
export async function isInsideWorkTree(path: string): Promise<boolean> {
  const res = await execGit(path, ['rev-parse', '--is-inside-work-tree']);
  return res.exitCode === 0 && res.stdout.trim() === 'true';
}

/** The working tree's top-level directory, or `null` when `path` is outside one. */
export async function workTreeTop(path: string): Promise<string | null> {
  const res = await execGit(path, ['rev-parse', '--show-toplevel']);
  return res.exitCode === 0 ? res.stdout.trim() || null : null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
