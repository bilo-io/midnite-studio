import type { RepoDescriptor } from '@midnite/git-shared';

/**
 * Which registered checkout a path is standing in.
 *
 * `root` is the *matched* checkout — a linked worktree when the path is inside
 * one, the repository root otherwise — because a worktree is what you navigate
 * by even though `repoId`/`repoName` still name the repository it belongs to.
 * `~/Dev/midnite-git/.worktrees/foo/packages` resolves to the `foo` worktree,
 * not to `midnite-git`.
 */
export type ResolvedRepoPath = {
  repoId: string;
  repoName: string;
  /** Absolute path of the matched checkout. Always a prefix of the query. */
  root: string;
};

/**
 * Longest-prefix match of an absolute path against every registered repository
 * and every worktree of one.
 *
 * Longest rather than first for a reason worth stating: a worktree usually
 * sits *inside* its repository (`<repo>/.worktrees/foo`), so both roots prefix
 * the same path and the shorter one is the wrong answer. The same rule keeps
 * two repositories whose paths nest from collapsing into each other.
 *
 * The match is separator-aware — `/Dev/midnite-git-old` is not inside
 * `/Dev/midnite-git`, and a plain `startsWith` says it is.
 */
export function resolveRepoForPath(
  path: string | null | undefined,
  repos: readonly RepoDescriptor[] | undefined,
): ResolvedRepoPath | null {
  if (!path || !repos?.length) return null;

  let best: ResolvedRepoPath | null = null;

  for (const repo of repos) {
    for (const root of [repo.path, ...repo.worktrees.map((w) => w.path)]) {
      if (!isInside(path, root)) continue;
      if (best && best.root.length >= root.length) continue;
      best = { repoId: repo.id, repoName: repo.name, root };
    }
  }

  return best;
}

/** `path` is `root` itself, or a descendant of it. */
function isInside(path: string, root: string): boolean {
  if (!root) return false;
  // `/` is its own separator; without this it would demand a doubled slash.
  const base = root.endsWith('/') && root.length > 1 ? root.slice(0, -1) : root;
  if (path === base) return true;
  return base === '/' ? path.startsWith('/') : path.startsWith(`${base}/`);
}
