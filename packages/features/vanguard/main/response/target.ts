import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { access, lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import type { SecurityFinding } from '@midnite/studio-shared';

/**
 * Where a response action may reach, and whether its target is still the thing the finding saw (Phase 120
 * Theme H). Every file action runs these checks twice: once for the blast-radius preview, again at act time.
 */

/** The `.app` bundle an executable runs from, or its directory when it is not in one (dev). */
export function appBundlePath(execPath: string): string {
  const at = execPath.indexOf('.app/');
  return at > 0 ? execPath.slice(0, at + '.app'.length) : dirname(execPath);
}

/** Seconds of slack between a sensor's clock reading and a file's mtime or a process's start. */
export const STALE_SLACK_MS = 5_000;

/** System locations no response action touches, whoever owns the file. */
const SYSTEM_PREFIXES = ['/System/', '/usr/', '/bin/', '/sbin/', '/dev/', '/private/var/db/', '/Library/Apple/'];

/**
 * The ledger stores paths with the home directory folded to `~` (Phase 115 redaction), so an action read back
 * from disk carries `~/…`. Expanded here, once, before any check.
 */
export function expandHome(path: string, home: string): string {
  if (path === '~') return home;
  return path.startsWith('~/') ? join(home, path.slice(2)) : path;
}

const within = (path: string, root: string): boolean => {
  const r = root.endsWith('/') ? root : `${root}/`;
  return path === root || path.startsWith(r);
};

export type TargetCheck = { ok: true; path: string; stat: Stats } | { ok: false; error: string };

export interface ReachDeps {
  homeDir: string;
  uid: number;
  /** The app's own bundle and data: never a target. */
  protectedPaths: readonly string[];
}

/**
 * A regular file the user owns, in a directory the user can write, outside the system and the app's own
 * tree, and not a symlink (a link is refused, never followed: acting on what it points at is how a planted
 * link turns "quarantine this" into "move that").
 */
export async function checkFileTarget(rawPath: string, deps: ReachDeps): Promise<TargetCheck> {
  const path = expandHome(rawPath, deps.homeDir);
  if (!isAbsolute(path) || normalize(path) !== path || path.endsWith('/')) {
    return { ok: false, error: `${rawPath} is not a plain absolute path.` };
  }
  let parentReal: string;
  try {
    parentReal = await realpath(dirname(path));
  } catch {
    return { ok: false, error: `${path} no longer exists.` };
  }
  for (const candidate of [path, join(parentReal, path.slice(path.lastIndexOf('/') + 1))]) {
    if (SYSTEM_PREFIXES.some((prefix) => candidate.startsWith(prefix) && !candidate.startsWith('/usr/local/'))) {
      return { ok: false, error: `${path} is a system file; Vanguard does not touch those.` };
    }
    if (deps.protectedPaths.some((root) => within(candidate, root))) {
      return { ok: false, error: `${path} belongs to Midnite itself; Vanguard does not act on its own files.` };
    }
  }
  let stat: Stats;
  try {
    stat = await lstat(path);
  } catch {
    return { ok: false, error: `${path} no longer exists.` };
  }
  if (stat.isSymbolicLink()) return { ok: false, error: `${path} is a symbolic link; Vanguard does not follow links.` };
  if (!stat.isFile()) return { ok: false, error: `${path} is not a regular file.` };
  if (stat.uid !== deps.uid) return { ok: false, error: `${path} belongs to another user; it is outside what Vanguard may change.` };
  try {
    await access(dirname(path), constants.W_OK);
  } catch {
    return { ok: false, error: `${dirname(path)} is not writable by you; Vanguard does not escalate.` };
  }
  return { ok: true, path, stat };
}

/** SHA-256 of a file opened without following a link; null when it cannot be read. */
export async function sha256NoFollow(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(1 << 16);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

/** The SHA-256 the finding recorded for `path`, from a `path` or `hash` evidence item. */
export function recordedHash(finding: SecurityFinding, path: string, home: string): string | null {
  for (const item of finding.evidence) {
    if (item.kind === 'path' && item.hash && expandHome(item.path, home) === path) return item.hash;
  }
  for (const item of finding.evidence) {
    if (item.kind === 'hash' && item.algorithm === 'sha256' && item.path && expandHome(item.path, home) === path) {
      // A `hash` item is the *before* hash for an integrity change; the path item carries the after hash and
      // wins above. Used only when no path item carries one.
      return item.value;
    }
  }
  return null;
}

/**
 * Is the file still the one the finding saw? Same SHA-256 when the finding recorded one; otherwise not
 * modified after the finding was last seen.
 */
export async function checkFileUnchanged(
  finding: SecurityFinding,
  target: { path: string; stat: Stats },
  home: string,
): Promise<{ ok: true; sha256: string } | { ok: false; error: string }> {
  const sha256 = await sha256NoFollow(target.path);
  if (sha256 === null) return { ok: false, error: `${target.path} could not be read.` };
  const expected = recordedHash(finding, target.path, home);
  if (expected !== null) {
    return expected === sha256
      ? { ok: true, sha256 }
      : { ok: false, error: `${target.path} has changed since the finding (its hash differs); run the sensor again before acting.` };
  }
  if (target.stat.mtimeMs > finding.lastSeen + STALE_SLACK_MS) {
    return { ok: false, error: `${target.path} was modified after the finding was last seen; run the sensor again before acting.` };
  }
  return { ok: true, sha256 };
}

export function formatMode(mode: number): string {
  return `0${(mode & 0o7777).toString(8).padStart(3, '0')}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
