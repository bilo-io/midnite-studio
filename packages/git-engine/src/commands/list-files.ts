import { execGit } from '../exec/git-exec';

/**
 * Maximum number of files returned by `listFiles` before flagging truncation.
 * Guardrail from Phase 23 Theme G.
 */
export const LIST_FILES_MAX = 20_000;

export type ListFilesResult = {
  files: string[];
  truncated: boolean;
};

/**
 * Lists tracked and untracked repository files via `git ls-files -z --cached --others --exclude-standard`.
 *
 * All git parsing is NUL-delimited (`-z`), respecting `.gitignore` rules via `--exclude-standard`.
 * Caps at 20 000 paths and returns a `truncated` flag if the cap was exceeded.
 */
export async function listFiles(
  worktreePath: string,
  limit = LIST_FILES_MAX,
): Promise<ListFilesResult> {
  const res = await execGit(worktreePath, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);

  if (res.exitCode !== 0) {
    return { files: [], truncated: false };
  }

  // Split on NUL delimiter; filter out empty final element
  const parts = res.stdout.split('\0').filter((p) => p.length > 0);
  const truncated = parts.length > limit;
  const files = truncated ? parts.slice(0, limit) : parts;

  return { files, truncated };
}
