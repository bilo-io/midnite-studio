import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

/**
 * The path jail (Phase 16; in the runtime since Phase 113 Theme Q, so a
 * feature's main half — the media store — confines paths the same way
 * Studio's read-only fs surface does).
 *
 * Every path the renderer sends is relative to a scope root and must still be
 * inside that root after joining, normalising AND resolving symlinks. `..`
 * traversal falls out of `resolve`; a symlink pointing out of the root falls
 * out of `realpath`. Anything that fails confinement resolves to `null`.
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
