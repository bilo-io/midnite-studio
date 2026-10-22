import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  extractIntegrityContent,
  integrityEntriesFor,
  integrityFileKey,
  type IntegrityBase,
  type IntegrityWatchEntry,
} from '@midnite/studio-shared';

/**
 * Finding and hashing the watched files of one scope (Phase 120 C). Plain `node:fs`, no `electron`.
 *
 * A directory entry (`.claude/`, `.githooks/`, …) is walked to a bounded depth and file count, never
 * following a symlink and never descending into `node_modules` or a nested `.git`: the watched set is a
 * handful of config files, and a walk that wandered into a vendored tree would turn a cheap re-hash into
 * a disk scan.
 */

/** The anchors a scope's entries resolve against. A missing anchor skips its entries. */
export interface IntegrityRoots {
  scope: 'repo' | 'user';
  worktree?: string;
  gitDir?: string;
  home?: string;
}

export interface WatchedFile {
  /** `<base>:<relPath>`, the baseline key. */
  key: string;
  base: IntegrityBase;
  relPath: string;
  absPath: string;
  entry: IntegrityWatchEntry;
}

export const WALK_MAX_DEPTH = 8;
export const WALK_MAX_FILES = 2000;
const SKIP_DIRS = new Set(['node_modules', '.git']);
/** Above this, an `extract` file is hashed whole by stream rather than parsed. */
const EXTRACT_MAX_BYTES = 8 * 1024 * 1024;

export function baseDir(roots: IntegrityRoots, base: IntegrityBase): string | undefined {
  if (base === 'worktree') return roots.worktree;
  if (base === 'git-dir') return roots.gitDir;
  return roots.home;
}

async function walk(dir: string, rel: string, depth: number, out: string[]): Promise<void> {
  if (depth > WALK_MAX_DEPTH || out.length >= WALK_MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // A nested checkout (Claude Code's `.claude/worktrees/<name>`, a vendored repo) is code, not config.
  if (depth > 1 && entries.some((dirent) => dirent.name === '.git')) return;
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const dirent of entries) {
    if (out.length >= WALK_MAX_FILES) return;
    const childRel = `${rel}/${dirent.name}`;
    if (dirent.isDirectory()) {
      if (SKIP_DIRS.has(dirent.name)) continue;
      await walk(join(dir, dirent.name), childRel, depth + 1, out);
    } else if (dirent.isFile() || dirent.isSymbolicLink()) {
      out.push(childRel);
    }
  }
}

/**
 * Every watched file that exists now, plus every `file` entry whether or not it exists (so a file that
 * appears later is a change from "absent", not a fresh baseline).
 */
export async function enumerateWatched(roots: IntegrityRoots): Promise<WatchedFile[]> {
  const files: WatchedFile[] = [];
  const push = (entry: IntegrityWatchEntry, root: string, relPath: string): void => {
    files.push({ key: integrityFileKey(entry.base, relPath), base: entry.base, relPath, absPath: join(root, relPath), entry });
  };
  for (const entry of integrityEntriesFor(roots.scope)) {
    const root = baseDir(roots, entry.base);
    if (root === undefined) continue;
    if (entry.match === 'file') {
      push(entry, root, entry.path);
    } else if (entry.match === 'dir') {
      const rels: string[] = [];
      await walk(join(root, entry.path), entry.path, 1, rels);
      for (const rel of rels) push(entry, root, rel);
    } else {
      let names: string[] = [];
      try {
        const dirents = await readdir(root, { withFileTypes: true });
        names = dirents
          .filter((d) => (d.isFile() || d.isSymbolicLink()) && d.name.startsWith(entry.path))
          .map((d) => d.name)
          .sort();
      } catch {
        names = [];
      }
      for (const name of names) push(entry, root, name);
    }
  }
  return files;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hashStream(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * SHA-256 of what the entry says to hash, or `null` when the file is absent or unreadable. A symlink is
 * hashed by its target string (`symlink:<target>`), so swapping a hook for a link is a change and the
 * hash never depends on a file outside the watched set.
 */
export async function hashWatched(file: WatchedFile): Promise<string | null> {
  let stat;
  try {
    stat = await lstat(file.absPath);
  } catch {
    return null;
  }
  try {
    if (stat.isSymbolicLink()) return sha256Hex(`symlink:${await readlink(file.absPath)}`);
    if (!stat.isFile()) return null;
    if (file.entry.extract === 'whole' || stat.size > EXTRACT_MAX_BYTES) return await hashStream(file.absPath);
    const text = await readFile(file.absPath, 'utf8');
    return sha256Hex(extractIntegrityContent(file.entry.extract, text));
  } catch {
    return null;
  }
}
