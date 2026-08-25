import { DIFF_DEFAULT_CONTEXT, type FileDiff } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { parseUnifiedDiff } from '../parsers/diff-parser';

/**
 * Diff reads.
 *
 * Both entry points return a parsed `FileDiff` rather than patch text: the
 * renderer may not import this package, so parsing here is what lets one
 * `<DiffView>` render a worktree diff and a commit diff from the same shape.
 *
 * `--no-color` because the engine's `LC_ALL=C` env does not disable colour, and
 * a user with `color.ui = always` would otherwise get ANSI escapes rendered as
 * literal `ESC[32m` in the pane. `--no-ext-diff` because a configured external
 * differ produces output no unified-diff parser can read.
 *
 * `-M` (rename detection) is on deliberately: without it a rename shows as a
 * whole file deleted plus a whole file added, which is exactly the diff nobody
 * wants to read.
 */

const BASE_ARGS = ['--no-color', '--no-ext-diff', '-M'] as const;

export type DiffOptions = {
  /** `-U` context. Defaults to git's own 3. */
  context?: number;
  /** Cap on parsed body lines — see DIFF_LINE_CAP. */
  maxLines?: number;
  /**
   * The pre-image path, when the caller already knows this file was renamed
   * (`StatusEntry.origPath`).
   *
   * Rename detection compares a deletion against an addition, and a pathspec is
   * applied *before* that pairing — so `git diff -M -- new-name` sees only the
   * addition and reports a brand-new file whose every line is green. Naming both
   * sides in the pathspec is what lets `-M` do its job on a scoped diff.
   */
  oldPath?: string;
};

/** Pathspec covering both sides of a possible rename. */
function pathspec(path: string, oldPath: string | undefined): string[] {
  return oldPath && oldPath !== path ? ['--', oldPath, path] : ['--', path];
}

/**
 * A path's diff in the worktree (or the index, with `staged`).
 *
 * An untracked file has no diff at all — `git diff` says nothing about it — so
 * this falls back to the `/dev/null` diff git itself would produce. Showing
 * "no changes" for a file the user can plainly see in the list is wrong.
 */
export async function readFileDiff(
  worktreePath: string,
  path: string,
  staged: boolean,
  opts: DiffOptions = {},
): Promise<FileDiff> {
  const context = opts.context ?? DIFF_DEFAULT_CONTEXT;
  const args = ['diff', ...BASE_ARGS, `-U${context}`];
  if (staged) args.push('--cached');
  args.push(...pathspec(path, opts.oldPath));

  const res = await execGit(worktreePath, args);
  if (res.exitCode === 0 && res.stdout.trim().length > 0) {
    return parse(res.stdout, path, context, opts);
  }

  if (!staged) {
    // `--no-index` exits 1 when the files differ, which is the normal case here.
    const untracked = await execGit(worktreePath, [
      'diff',
      ...BASE_ARGS,
      `-U${context}`,
      '--no-index',
      '--',
      '/dev/null',
      path,
    ]);
    if (untracked.stdout.trim().length > 0) {
      const diff = parse(untracked.stdout, path, context, opts);
      // `--no-index` has no index to compare against, so it never emits the
      // "new file mode" header that would classify this as an addition.
      return { ...diff, change: 'added' };
    }
  }

  return parse(res.stdout, path, context, opts);
}

/**
 * A path's diff inside a commit.
 *
 * `git show` on a merge commit prints nothing by default — a merge has no single
 * pre-image, so git declines to guess. `-m` asks for the diff against each
 * parent in turn; taking the first-parent diff is the conventional "what did
 * this merge bring in relative to the branch it landed on" answer, and it's what
 * the graph's first-parent ordering already implies.
 */
export async function readCommitFileDiff(
  repoPath: string,
  sha: string,
  path: string,
  opts: DiffOptions = {},
): Promise<FileDiff> {
  const context = opts.context ?? DIFF_DEFAULT_CONTEXT;
  const res = await execGit(repoPath, [
    'show',
    ...BASE_ARGS,
    `-U${context}`,
    '--first-parent',
    '-m',
    '--format=',
    sha,
    ...pathspec(path, opts.oldPath),
  ]);

  return parse(res.stdout, path, context, opts);
}

function parse(stdout: string, path: string, context: number, opts: DiffOptions): FileDiff {
  return parseUnifiedDiff(stdout, {
    contextLines: context,
    fallbackPath: path,
    ...(opts.maxLines === undefined ? {} : { maxLines: opts.maxLines }),
  });
}
