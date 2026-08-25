import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { resolveWorkdir } from './repo-registry';

/**
 * The path jail for the read-only fs surface (Phase 16).
 *
 * Every path the renderer sends is relative to a scope root — a repository
 * checkout or `~/.claude` — and must still be inside that root after joining,
 * normalising AND resolving symlinks. `..` traversal falls out of `resolve`;
 * a symlink pointing out of the root falls out of `realpath`. Anything that
 * fails confinement resolves to `null`, and the handlers turn that into an
 * ordinary error payload — never a throw across the boundary.
 */

/**
 * Join `relPath` under `root`, refusing absolute paths, NUL bytes and any
 * result that normalises outside the root. Pure — the symlink check is the
 * async half below, and this half is what the unit tests hammer.
 */
export function joinWithin(root: string, relPath: string): string | null {
  if (relPath.includes('\0')) return null;
  if (isAbsolute(relPath) || /^[a-zA-Z]:[\\/]/.test(relPath)) return null;
  const rootResolved = resolve(root);
  const joined = resolve(rootResolved, relPath);
  if (joined !== rootResolved && !joined.startsWith(rootResolved + sep)) return null;
  return joined;
}

/**
 * The symlink half of the jail: the target's real path must still sit under
 * the root's real path. Missing files resolve to `null` too — for a read-only
 * browser "not there" and "not allowed" earn the same answer.
 */
export async function confineToRoot(root: string, relPath: string): Promise<string | null> {
  const joined = joinWithin(root, relPath);
  if (joined === null) return null;
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(joined)]);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
    return realTarget;
  } catch {
    return null;
  }
}

export type FsScopeRequest =
  | { scope: 'repo'; repoId: string; worktreePath?: string | undefined }
  | { scope: 'claude-home' };

/** Overridable for tests; production always means the real `~/.claude`. */
export const claudeHome = (): string => join(homedir(), '.claude');

/**
 * The root a scoped request is confined to. `repo` goes through the registry's
 * `resolveWorkdir`, which already validates a renderer-supplied worktree path
 * against the repo's real worktree list — the same trust boundary every git
 * handler crosses.
 */
export async function resolveScopeRoot(req: FsScopeRequest): Promise<string | null> {
  if (req.scope === 'claude-home') return claudeHome();
  return resolveWorkdir(req.repoId, req.worktreePath);
}
