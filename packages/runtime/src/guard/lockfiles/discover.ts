import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LOCKFILE_PARSERS, parseLockfile } from './parsers';
import type { LockedPackage } from './types';

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'target', 'vendor', '.venv', 'venv']);
const MAX_DEPTH = 4;
const MAX_BYTES = 20 * 1024 * 1024;

/** Lockfile paths under a repo, skipping dependency and build folders. */
export async function discoverLockfiles(root: string, depth = 0): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name in LOCKFILE_PARSERS) found.push(join(root, entry.name));
    else if (entry.isDirectory() && depth < MAX_DEPTH && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
      found.push(...(await discoverLockfiles(join(root, entry.name), depth + 1)));
    }
  }
  return found;
}

/** The `lockfiles` Guard input: every parsable lockfile in the open repos, packages flattened. */
export async function resolveLockfiles(repos: readonly string[]): Promise<LockedPackage[]> {
  const out: LockedPackage[] = [];
  for (const repo of repos) {
    for (const path of await discoverLockfiles(repo)) {
      try {
        const body = await readFile(path, 'utf8');
        if (body.length > MAX_BYTES) continue;
        out.push(...parseLockfile(path.slice(path.lastIndexOf('/') + 1), body, { path }));
      } catch {
        // unreadable lockfile: skipped
      }
    }
  }
  return out;
}
