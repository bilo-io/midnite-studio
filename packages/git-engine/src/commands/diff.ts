import { DIFF_DEFAULT_CONTEXT, type FileDiff } from '@midnite/studio-shared';

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

/**
 * `--literal-pathspecs` is load-bearing, not hygiene. Without it git glob-matches
 * the path, so a Next.js-style `pages/[id].tsx` is a character class: it matches
 * `pages/i.tsx` and the pane renders a DIFFERENT file's content under the
 * requested filename. Every path here comes from a status entry or a commit's
 * file list — always a literal path, never a user-typed pattern.
 *
 * It is a MAIN git option, not a subcommand one: `git diff --literal-pathspecs`
 * exits 255 with "invalid option", which reads downstream as an empty diff
 * rather than as an error.
 */
const LITERAL = ['--literal-pathspecs'] as const;

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
  const args = [...LITERAL, 'diff', ...BASE_ARGS, `-U${context}`];
  if (staged) args.push('--cached');
  args.push(...pathspec(path, opts.oldPath));

  const res = await execGit(worktreePath, args);
  if (res.exitCode === 0 && res.stdout.trim().length > 0) {
    return parse(res.stdout, path, context, opts);
  }

  // Empty output is ambiguous: an untracked file (which `git diff` says nothing
  // about) looks exactly like a tracked file with no unstaged changes. Guessing
  // "untracked" and running the /dev/null diff renders an entire staged file as
  // one green block, so ask git which it is.
  if (!staged && !(await isTracked(worktreePath, path))) {
    const untracked = await execGit(worktreePath, [
      ...LITERAL,
      'diff',
      ...BASE_ARGS,
      `-U${context}`,
      '--no-index',
      '--',
      '/dev/null',
      path,
    ]);
    if (untracked.stdout.trim().length > 0) {
      return parse(untracked.stdout, path, context, opts);
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
    ...LITERAL,
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

/** Whether git has this path in the index — the untracked test that matters. */
async function isTracked(worktreePath: string, path: string): Promise<boolean> {
  const res = await execGit(worktreePath, [
    ...LITERAL,
    'ls-files',
    '--error-unmatch',
    '--',
    path,
  ]);
  return res.exitCode === 0;
}

function parse(stdout: string, path: string, context: number, opts: DiffOptions): FileDiff {
  return parseUnifiedDiff(stdout, {
    contextLines: context,
    fallbackPath: path,
    ...(opts.maxLines === undefined ? {} : { maxLines: opts.maxLines }),
  });
}
