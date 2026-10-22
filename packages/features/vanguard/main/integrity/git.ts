import { isAbsolute, resolve } from 'node:path';

import type { IntegrityRunProcess } from './run-process';

/**
 * The two git reads the integrity sensor makes (Phase 120 C). Both are reads, so neither goes through the
 * write queue, and `status` runs with `--no-optional-locks` so it never takes `index.lock` to refresh the
 * index behind a writer's back. Status output is NUL-delimited (`-z`), never split on newlines.
 */

const GIT_TIMEOUT_MS = 15_000;

/**
 * The repo's common git dir — `.git` for a plain checkout, the main checkout's `.git` for a linked
 * worktree — which is where `hooks/` lives. `undefined` when git cannot say.
 */
export async function resolveGitCommonDir(run: IntegrityRunProcess, worktree: string): Promise<string | undefined> {
  const result = await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: worktree,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!result.ok || result.exitCode !== 0) return undefined;
  // One value, not a list: drop exactly the one terminating newline git prints, nothing else.
  const value = result.stdout.endsWith('\n') ? result.stdout.slice(0, -1) : result.stdout;
  if (value.length === 0) return undefined;
  return isAbsolute(value) ? value : resolve(worktree, value);
}

/**
 * Paths `git status --porcelain=v1 -z` lists: `XY <path>\0`, with a rename or copy carrying its source
 * path as a second NUL-terminated field (both are returned). Repo-relative paths; an ignored or untracked
 * directory is listed by git with a trailing `/`.
 */
export function parsePorcelainZ(stdout: string): Set<string> {
  const paths = new Set<string>();
  const fields = stdout.split('\0');
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]!;
    if (field.length < 4) continue;
    const x = field[0];
    paths.add(field.slice(3));
    // A rename's source is gone from the tree, which is just as uncommitted as its destination.
    if (x === 'R' || x === 'C') {
      i += 1;
      if (fields[i]) paths.add(fields[i]!);
    }
  }
  return paths;
}

/** True when `relPath`, or a directory above it, is in a porcelain listing. */
export function listedInStatus(listed: ReadonlySet<string>, relPath: string): boolean {
  if (listed.has(relPath)) return true;
  const parts = relPath.split('/');
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    if (listed.has(`${parts.slice(0, n).join('/')}/`)) return true;
  }
  return false;
}

/**
 * Of `relPaths`, the ones whose current state is *not* what HEAD holds: modified, staged, deleted,
 * untracked or ignored. A path git does not list is committed as it stands. `undefined` when git could
 * not answer, which the caller reads as "every path is uncommitted" — the side that reports.
 */
export async function uncommittedPaths(
  run: IntegrityRunProcess,
  worktree: string,
  relPaths: readonly string[],
): Promise<Set<string> | undefined> {
  if (relPaths.length === 0) return new Set();
  const result = await run(
    'git',
    [
      '--no-optional-locks',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--ignored=matching',
      '--',
      ...relPaths.map((path) => `:(literal)${path}`),
    ],
    { cwd: worktree, timeoutMs: GIT_TIMEOUT_MS },
  );
  if (!result.ok || result.exitCode !== 0) return undefined;
  const listed = parsePorcelainZ(result.stdout);
  return new Set(relPaths.filter((path) => listedInStatus(listed, path)));
}
