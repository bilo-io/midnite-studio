import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LockedPackage } from './types';

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

/** What is actually installed under `<repo>/node_modules` (top level and scopes), as the lockfile may lag it. */
export async function resolveInstalledNodeModules(repos: readonly string[]): Promise<LockedPackage[]> {
  const out: LockedPackage[] = [];
  for (const repo of repos) {
    const root = join(repo, 'node_modules');
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      continue;
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
  return out;
}
