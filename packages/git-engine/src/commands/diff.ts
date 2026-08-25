import { execGit } from '../exec/git-exec';

/**
 * A file's unified diff, as text.
 *
 * A text stub by design (docs/INITIAL_PLAN.md): a real side-by-side diff viewer
 * is deferred post-MVP, and rendering git's own unified output is honest about
 * that rather than half-building one.
 *
 * `--no-color` because the engine's `LC_ALL=C` env does not disable colour, and
 * a user with `color.ui = always` would otherwise get ANSI escapes rendered as
 * literal `ESC[32m` in the pane.
 */
export async function readFileDiff(
  worktreePath: string,
  path: string,
  staged: boolean,
): Promise<string> {
  const args = ['diff', '--no-color', '--no-ext-diff'];
  if (staged) args.push('--cached');
  args.push('--', path);

  const res = await execGit(worktreePath, args);
  if (res.exitCode === 0 && res.stdout.trim().length > 0) return res.stdout;

  // An untracked file has no diff at all — `git diff` says nothing about it.
  // Showing "no changes" for a file the user can plainly see in the list is
  // wrong, so fall back to the /dev/null diff git itself would produce.
  if (!staged) {
    const untracked = await execGit(worktreePath, [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-index',
      '--',
      '/dev/null',
      path,
    ]);
    if (untracked.stdout.trim().length > 0) return untracked.stdout;
  }

  return res.stdout;
}
