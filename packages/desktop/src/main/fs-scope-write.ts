import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { joinWithin } from './fs-scope';

/**
 * The path jail for the writable fs surface (Phase 24) — everything a write
 * can do wrong, this file exists to make it do right instead. `fs-scope.ts`
 * stays untouched and load-bearing: its `joinWithin`/`confineToRoot` are for
 * reads, where "not there" and "not allowed" earn the same answer. A write
 * needs the opposite for its own target — `new file` has nothing to
 * `realpath` yet — so this module confines the *parent* and leaves the final
 * segment unresolved.
 *
 * The bounds, restated where someone adding to this file will read them:
 *
 * - **The parent must already exist.** `confineParent` never creates missing
 *   intermediate directories. Nothing in the UI produces a multi-segment new
 *   path (New File/Folder always targets the expanded directory, which is
 *   already there), so this is the narrower, safer contract rather than a
 *   `mkdir -p` nobody asked for.
 * - **A symlink as the final segment is always refused**, for every one of
 *   write/create/rename/delete. `fs-scope.ts`'s `confineToRoot` resolves a
 *   symlink and hands back its target — correct for a read, and for a write
 *   it would silently rewrite whatever the link points at instead of the
 *   link itself.
 * - **`.git` is refused at any depth**, not just as a final segment. The
 *   read path's `isIgnored` flag on a `.git` entry is cosmetic — a hint to
 *   dim the row — and is never a gate; this is the gate.
 * - **The TOCTOU window is closed by writing through a descriptor.** Once a
 *   path is confined, nothing in this file re-resolves it by name — an
 *   overwrite opens with `O_NOFOLLOW` so a symlink swapped in after
 *   confinement is refused by the open call itself, and a create opens with
 *   `O_CREAT | O_EXCL` so it fails outright if anything is already there.
 */

/** A write's target, split at confinement time: `dir` is real and inside the
 *  root; `name` is the final path segment, deliberately left unresolved. */
export interface ConfinedTarget {
  dir: string;
  name: string;
}

const RESERVED_SEGMENTS = new Set(['.', '..', '.git']);

function isValidFinalSegment(name: string): boolean {
  return name.length > 0 && !name.includes('/') && !RESERVED_SEGMENTS.has(name);
}

function hasGitSegment(relPath: string): boolean {
  return relPath.split('/').some((segment) => segment === '.git');
}

/**
 * Confine a write's own target: the parent directory must resolve (through
 * symlinks) to somewhere inside `root`, and the final segment is returned
 * unresolved rather than `realpath`'d, since a create's target does not yet
 * exist. Refuses `.` / `..` / empty / separator-bearing / `.git` final
 * segments, any `.git` ancestor segment, and a parent that does not exist.
 */
export async function confineParent(root: string, relPath: string): Promise<ConfinedTarget | null> {
  if (relPath.includes('\0') || hasGitSegment(relPath)) return null;
  // Shape-checks the WHOLE path first — absolute, a Windows drive letter, `..`
  // traversal — the same guard the read jail applies, so a single-segment
  // relPath (no `/` to split on below) still gets it.
  if (joinWithin(root, relPath) === null) return null;

  const lastSlash = relPath.lastIndexOf('/');
  const parentRel = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
  const name = lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1);
  if (!isValidFinalSegment(name)) return null;

  const parentJoined = joinWithin(root, parentRel);
  if (parentJoined === null) return null;

  try {
    const [rootReal, parentReal] = await Promise.all([realpath(root), realpath(parentJoined)]);
    if (parentReal !== rootReal && !parentReal.startsWith(rootReal + sep)) return null;
    return { dir: parentReal, name };
  } catch {
    return null; // the parent does not exist (or a stat raced it away)
  }
}

export function targetPath(target: ConfinedTarget): string {
  return join(target.dir, target.name);
}

/**
 * Whether a confined target already exists as (or through) a symlink —
 * including a dangling one, which must fail as "not a regular file" rather
 * than "not allowed", or the message lies about which rule it hit.
 */
export async function isSymlinkTarget(target: ConfinedTarget): Promise<boolean> {
  try {
    return (await lstat(targetPath(target))).isSymbolicLink();
  } catch {
    return false; // does not exist at all — not a symlink question
  }
}

/** True when a confined target exists at all (regular file, dir, or symlink). */
export async function targetExists(target: ConfinedTarget): Promise<boolean> {
  try {
    await lstat(targetPath(target));
    return true;
  } catch {
    return false;
  }
}

/**
 * Open an existing file for overwrite with `O_NOFOLLOW`, so a symlink planted
 * at the target between confinement and this call is refused by the open
 * call rather than silently followed. Returns `null` on any failure (missing
 * file, permission, symlink) — the caller maps that to a `GitOpResult`.
 */
export async function openForOverwrite(target: ConfinedTarget): Promise<FileHandle | null> {
  try {
    return await open(targetPath(target), fsConstants.O_RDWR | fsConstants.O_NOFOLLOW);
  } catch {
    return null;
  }
}

/**
 * Create a new, empty file with `O_CREAT | O_EXCL`: fails outright if
 * anything — a real file, a directory, or a symlink — already sits at the
 * target, closing the create race in the open call itself.
 */
export async function createFile(target: ConfinedTarget): Promise<FileHandle | null> {
  try {
    return await open(
      targetPath(target),
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    );
  } catch {
    return null;
  }
}

/**
 * Create a new, empty directory, then re-`lstat` it: `mkdir` has no
 * descriptor to open through, so the residual race this closes is narrower —
 * a concurrent process swapping the parent for a symlink between
 * confinement and the call. `mkdir` itself refuses outright if the target
 * already exists (`EEXIST`), which is the create race proper.
 */
export async function createDirectory(target: ConfinedTarget): Promise<boolean> {
  const path = targetPath(target);
  try {
    await mkdir(path);
  } catch {
    return false;
  }
  try {
    return !(await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Human-readable text for the common `fs` error codes a write handler hits. */
export function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'ENOENT':
      return 'the file no longer exists';
    case 'EACCES':
    case 'EPERM':
      return 'permission denied';
    case 'EEXIST':
      return 'something already exists at that path';
    case 'ENOTDIR':
      return 'a path segment is not a directory';
    case 'EISDIR':
      return 'that path is a directory, not a file';
    case 'ENOSPC':
      return 'no space left on device';
    case 'ENOTEMPTY':
      return 'the directory is not empty';
    default:
      return error instanceof Error ? error.message : String(error);
  }
}
