import { join } from 'node:path';

import type { TestsFs } from './fs';
import { safeJsonParse } from './fs';

/**
 * Which package manager would actually run a script — decided once, from the
 * lockfile at the workspace root, because that is the one signal that cannot
 * lie: a repo with `pnpm-lock.yaml` runs its scripts through pnpm regardless of
 * what any individual package would prefer.
 */
export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export async function detectPackageManager(repoRoot: string, fs: TestsFs): Promise<PackageManager> {
  if (await fs.exists(join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fs.exists(join(repoRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * A single trailing wildcard segment (`packages/*`), which is what every real
 * workspace config in the wild actually uses. Not a general glob engine —
 * `**` and bracket patterns are out of scope, and a pattern with neither is
 * used as a literal path.
 */
async function expandGlob(repoRoot: string, pattern: string, fs: TestsFs): Promise<string[]> {
  const star = pattern.indexOf('*');
  if (star === -1) return [join(repoRoot, pattern)];

  const prefix = pattern.slice(0, star).replace(/\/+$/, '');
  const entries = await fs.listDir(join(repoRoot, prefix));
  return entries.filter((e) => e.isDirectory).map((e) => join(repoRoot, prefix, e.name));
}

/**
 * `packages:` out of a minimal `pnpm-workspace.yaml` — a line scanner, not a
 * YAML parser. The file this repo (and most pnpm workspaces) ships is a flat
 * list under one key, and that shape is all this reads.
 */
export function parsePnpmWorkspaceGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    if (/^packages:\s*$/.test(line.trim()) && !/^\s/.test(raw)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = line.match(/^\s+-\s*['"]?([^'"]+?)['"]?\s*$/);
    if (item && item[1] !== undefined) {
      globs.push(item[1]);
      continue;
    }
    // Any other non-blank line ends the list — a sibling top-level key, or the
    // list plainly finished.
    if (line.trim().length > 0) inPackages = false;
  }
  return globs;
}

/**
 * Every workspace member with its own `package.json`, npm/yarn `workspaces`
 * first and `pnpm-workspace.yaml` second. Empty for a plain single-package
 * repo — the caller's cue to treat the root itself as the one package.
 */
export async function resolveWorkspacePackages(repoRoot: string, fs: TestsFs): Promise<string[]> {
  const globs: string[] = [];

  const rootPkgRaw = await fs.readFile(join(repoRoot, 'package.json'));
  const rootPkg = rootPkgRaw ? safeJsonParse(rootPkgRaw) : null;
  const workspaces = rootPkg?.['workspaces'];
  if (Array.isArray(workspaces)) {
    globs.push(...workspaces.filter((g): g is string => typeof g === 'string'));
  } else if (
    workspaces &&
    typeof workspaces === 'object' &&
    Array.isArray((workspaces as { packages?: unknown }).packages)
  ) {
    globs.push(
      ...(workspaces as { packages: unknown[] }).packages.filter(
        (g): g is string => typeof g === 'string',
      ),
    );
  }

  if (globs.length === 0) {
    const pnpmYaml = await fs.readFile(join(repoRoot, 'pnpm-workspace.yaml'));
    if (pnpmYaml) globs.push(...parsePnpmWorkspaceGlobs(pnpmYaml));
  }

  const dirs = new Set<string>();
  for (const glob of globs) {
    for (const dir of await expandGlob(repoRoot, glob, fs)) {
      if (await fs.exists(join(dir, 'package.json'))) dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/**
 * Does this package's own `moon.yml` declare `tasks.<name>` itself, rather
 * than inheriting it from `.moon/tasks/*.yml`?
 *
 * A line scan, not a YAML parser: it looks for `<name>:` nested one level
 * under a top-level `tasks:` key, which is the only shape a project-local task
 * override takes in practice (`git-engine/moon.yml`'s `typecheck.deps` is
 * exactly this). Good enough to answer "which file declared this" without
 * resolving moon's full inheritance graph.
 */
export function moonLocalTaskOverride(moonYaml: string, taskName: string): boolean {
  const lines = moonYaml.split('\n');
  let inTasks = false;
  for (const raw of lines) {
    if (/^tasks:\s*$/.test(raw.trim()) && !/^\s/.test(raw)) {
      inTasks = true;
      continue;
    }
    if (!inTasks) continue;
    if (/^\s+#/.test(raw) || raw.trim().length === 0) continue;
    const indent = raw.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent === 0) break; // dedented back to top level — tasks: block ended
    if (indent === 2 && new RegExp(`^\\s{2}${taskName}:\\s*$`).test(raw)) return true;
  }
  return false;
}
