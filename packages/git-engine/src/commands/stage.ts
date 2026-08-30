import type { GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { gitErrorLine } from './worktree-ops';

/**
 * Index manipulation.
 *
 * Everything here takes **explicit paths**. There is no "stage all" or
 * "discard all" that expands to a pathspec in this layer — the UI decides what
 * the user selected and sends exactly that. A `.`-shaped API is one bug away
 * from discarding a file the user never chose.
 *
 * The `--` separator is on every call: a path that looks like an option
 * (`-cache`, or a branch-named file) would otherwise be parsed as one.
 */

/** Chunk size for pathspec arguments, to stay under the OS argv limit. */
const PATH_BATCH = 500;

export async function stagePaths(worktreePath: string, paths: string[]): Promise<GitOpResult> {
  return batched(worktreePath, paths, (batch) => ['add', '--', ...batch], 'stage');
}

/**
 * Unstage.
 *
 * Neither obvious command works everywhere: `reset HEAD` AND `restore --staged`
 * both fail with "could not resolve HEAD" in an **unborn** repo — which is
 * precisely the moment a user is most likely to be undoing their very first
 * `git add`. Before the first commit there is no HEAD to restore the index
 * from, so the only correct operation is `rm --cached`, which drops the entry
 * and leaves the file untracked on disk.
 *
 * The fallback is triggered by the failure rather than by a pre-flight HEAD
 * check, so the normal path costs one git call, not two.
 */
export async function unstagePaths(worktreePath: string, paths: string[]): Promise<GitOpResult> {
  return batched(
    worktreePath,
    paths,
    (batch) => ['restore', '--staged', '--', ...batch],
    'unstage',
    {
      when: (stderr) => /could not resolve HEAD|ambiguous argument 'HEAD'/i.test(stderr),
      argsFor: (batch) => ['rm', '--cached', '--quiet', '--', ...batch],
    },
  );
}

/**
 * Discard working-tree changes for specific paths.
 *
 * The one genuinely destructive operation in this file: there is no reflog for
 * an uncommitted change, so a mistake here is unrecoverable. Two consequences:
 * the UI gates it behind a confirmation, and this never accepts a pathspec
 * pattern — only literal paths the user selected.
 *
 * Untracked files are NOT touched. `restore` only knows about tracked content,
 * and deleting untracked files is a different, much more dangerous operation
 * that deserves its own explicit action rather than riding along with "discard".
 */
export async function discardPaths(worktreePath: string, paths: string[]): Promise<GitOpResult> {
  return batched(
    worktreePath,
    paths,
    (batch) => ['restore', '--worktree', '--', ...batch],
    'discard',
  );
}

/** A second command to try when the first fails in a recognised way. */
type Fallback = {
  when: (stderr: string) => boolean;
  argsFor: (batch: string[]) => string[];
};

async function batched(
  worktreePath: string,
  paths: string[],
  argsFor: (batch: string[]) => string[],
  label: string,
  fallback?: Fallback,
): Promise<GitOpResult> {
  if (paths.length === 0) return ok();

  return writeQueue.run(worktreePath, async () => {
    for (let i = 0; i < paths.length; i += PATH_BATCH) {
      const batch = paths.slice(i, i + PATH_BATCH);
      let res = await execGit(worktreePath, argsFor(batch), { write: true });

      if (res.exitCode !== 0 && fallback?.when(res.stderr)) {
        res = await execGit(worktreePath, fallback.argsFor(batch), { write: true });
      }

      if (res.exitCode !== 0) {
        return failure(gitErrorLine(res.stderr) || `Could not ${label} those files.`, res.stderr);
      }
    }
    return ok();
  });
}
