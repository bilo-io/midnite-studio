import { execGit } from '../exec/git-exec';

/**
 * `core.hooksPath`, resolved relative to the repo when it is set and relative
 * (git's own rule — an absolute value is used as-is).
 *
 * `null` — never `''` — when the key is unset, so a caller can `??` a default
 * (`.git/hooks`) without mistaking "not configured" for "configured to the
 * repo root" (Phase 78 Theme E's installer does exactly that).
 */
export async function getHooksPath(repoPath: string): Promise<string | null> {
  const res = await execGit(repoPath, ['config', '--get', 'core.hooksPath']);
  // Exit 1 means the key is unset — a normal repo, not a failure.
  if (res.exitCode !== 0) return null;
  const value = res.stdout.replace(/\r?\n$/, '');
  return value.length > 0 ? value : null;
}
