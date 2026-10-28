import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LockedPackage } from './types';

/** How many `.pnpm` store folders are read at once. */
const PNPM_SCAN_CONCURRENCY = 32;

async function read(dir: string, path: string, out: LockedPackage[]): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
    if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
      out.push({ ecosystem: 'npm', name: pkg.name, version: pkg.version, direct: false, path });
    }
  } catch {
    // not a package
  }
}

/** `name@1.2.3` or `@scope+name@1.2.3_peer@4` (a `.pnpm` virtual-store folder) to the package name, or null. */
export function pnpmStoreName(dir: string): string | null {
  // `@scope+name@1.2.3_peer@4`: the name is everything before the first `@` that follows it, and may itself hold `_`.
  const match = /^(@?[^@]+)@\d/.exec(dir);
  return match ? match[1]!.replace('+', '/') : null;
}

async function scanModules(root: string, out: LockedPackage[]): Promise<void> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    if (name.startsWith('@')) {
      let scoped: string[] = [];
      try {
        scoped = await readdir(join(root, name));
      } catch {
        // unreadable scope
      }
      for (const inner of scoped) await read(join(root, name, inner), join(root, name, inner, 'package.json'), out);
    } else {
      await read(join(root, name), join(root, name, 'package.json'), out);
    }
  }
}

/**
 * What is actually installed under `<repo>/node_modules` (top level and scopes), as the lockfile may lag it, and
 * pnpm's virtual store `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, where transitive packages live.
 */
export async function resolveInstalledNodeModules(repos: readonly string[]): Promise<LockedPackage[]> {
  const out: LockedPackage[] = [];
  for (const repo of repos) {
    const root = join(repo, 'node_modules');
    await scanModules(root, out);
    let store: string[] = [];
    try {
      store = await readdir(join(root, '.pnpm'));
    } catch {
      // not a pnpm install
    }
    // The virtual store holds thousands of folders; read them in bounded parallel batches rather than one by one.
    for (let i = 0; i < store.length; i += PNPM_SCAN_CONCURRENCY) {
      await Promise.all(
        store.slice(i, i + PNPM_SCAN_CONCURRENCY).map(async (dir) => {
          const name = pnpmStoreName(dir);
          if (!name) return;
          const pkgDir = join(root, '.pnpm', dir, 'node_modules', name);
          await read(pkgDir, join(pkgDir, 'package.json'), out);
        }),
      );
    }
  }
  // The store is read in parallel, so completion order varies; sort for a stable result.
  out.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
