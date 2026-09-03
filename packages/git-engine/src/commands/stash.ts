import type {
  FileDiff,
  GitOpResult,
  StashDetail,
  StashDropResult,
  StashEntry,
  StashPart,
} from '@midnite/studio-shared';
import { conflict, failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { readCommitFileDiff, readRefDiff, type DiffOptions } from './diff';
import { parseNumstat } from './log';
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

/**
 * Resolve one of a stash's parents to a real sha, or `null` if it does not
 * exist — `^2` (the index state) is present on every ordinary stash, but `^3`
 * (untracked files) exists only when the stash was made with `-u`, and
 * `git rev-parse --verify` is how that absence is told apart from a genuine
 * error.
 */
async function resolveParent(worktreePath: string, selector: string, parent: 1 | 2 | 3): Promise<string | null> {
  const res = await execGit(worktreePath, ['rev-parse', '--verify', `${selector}^${parent}`]);
  return res.exitCode === 0 ? res.stdout.trim() : null;
}

/**
 * The file list for all three of a stash's parts (Phase 22 Theme D).
 *
 * `tracked` reuses the exact `--numstat -m --first-parent` invocation
 * `readCommitDetail` already makes for an ordinary commit — a stash entry
 * IS a commit, and its first parent is HEAD at stash time, so "this commit's
 * own diff" already answers "what changed in the working tree". `index` is a
 * genuine two-commit diff (`^1..^2`), and `untracked` is `^3`'s own diff
 * against nothing (it is a rootless commit, so every file in it is new).
 */
export async function readStashDetail(worktreePath: string, selector: string): Promise<StashDetail | null> {
  const [stashRes, headAtStash, indexSha, untrackedSha] = await Promise.all([
    execGit(worktreePath, ['rev-parse', '--verify', selector]),
    resolveParent(worktreePath, selector, 1),
    resolveParent(worktreePath, selector, 2),
    resolveParent(worktreePath, selector, 3),
  ]);
  if (stashRes.exitCode !== 0 || !headAtStash) return null;
  const sha = stashRes.stdout.trim();

  const [trackedRes, indexRes, untrackedRes] = await Promise.all([
    execGit(worktreePath, ['show', '--numstat', '-z', '-m', '--first-parent', '--pretty=format:', '--end-of-options', sha]),
    indexSha
      ? execGit(worktreePath, ['diff', '--numstat', '-z', '--end-of-options', headAtStash, indexSha])
      : Promise.resolve(null),
    untrackedSha
      ? execGit(worktreePath, ['show', '--numstat', '-z', '--pretty=format:', '--end-of-options', untrackedSha])
      : Promise.resolve(null),
  ]);

  return {
    tracked: trackedRes.exitCode === 0 ? parseNumstat(trackedRes.stdout) : [],
    index: indexRes && indexRes.exitCode === 0 ? parseNumstat(indexRes.stdout) : [],
    untracked: untrackedRes && untrackedRes.exitCode === 0 ? parseNumstat(untrackedRes.stdout) : [],
  };
}

/**
 * One file's hunks within one part of a stash — reuses `diff.ts` wholesale
 * rather than a third parsed shape, per the phase doc: `tracked` and
 * `untracked` are both plain `git show <sha> -- path` reads (a stash entry's
 * own diff against its first parent; `^3`'s own diff against nothing, since
 * it is rootless), so `readCommitFileDiff` already does the right thing for
 * both — only `index` (`^1..^2`) needs the two-ref form `readRefDiff` adds.
 */
export async function readStashFileDiff(
  worktreePath: string,
  selector: string,
  part: StashPart,
  path: string,
  opts: DiffOptions = {},
): Promise<FileDiff | null> {
  if (part === 'tracked') return readCommitFileDiff(worktreePath, selector, path, opts);

  if (part === 'untracked') {
    const untrackedSha = await resolveParent(worktreePath, selector, 3);
    if (!untrackedSha) return null;
    return readCommitFileDiff(worktreePath, untrackedSha, path, opts);
  }

  const [headAtStash, indexSha] = await Promise.all([
    resolveParent(worktreePath, selector, 1),
    resolveParent(worktreePath, selector, 2),
  ]);
  if (!headAtStash || !indexSha) return null;
  return readRefDiff(worktreePath, headAtStash, indexSha, path, opts);
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

/**
 * Restore a dropped stash — `git stash store`.
 *
 * The forward write Phase 22 Theme H's undo uses for `stash drop`: `stashDrop`
 * captures the commit sha a drop just made unreachable, and this is what
 * makes that sha reachable again, as a real stash entry rather than a bare
 * commit floating with nothing pointing at it. It is a NEW write through the
 * queue like every other undo in this app, never a reflog rewrite.
 */
export async function stashStore(
  worktreePath: string,
  sha: string,
  message?: string,
): Promise<GitOpResult> {
  const args = ['stash', 'store'];
  if (message !== undefined) args.push('-m', message);
  args.push(sha);

  const res = await run(worktreePath, args);
  if (res.exitCode === 0) return ok();

  if (/not a valid stash reference|is not a stash reference/i.test(res.stderr)) {
    return failure('That is not a stash commit — it cannot be restored as one.', res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || 'Could not restore the stash.', res.stderr);
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
