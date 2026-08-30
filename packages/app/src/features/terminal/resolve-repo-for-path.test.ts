import type { RepoDescriptor, Worktree } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveRepoForPath } from './resolve-repo-for-path';

const worktree = (repoId: string, path: string, isMain = false): Worktree => ({
  id: `${repoId}:${path}`,
  repoId,
  path,
  branch: 'main',
  headSha: 'a'.repeat(40),
  locked: false,
  isMain,
  prunable: false,
});

const repo = (id: string, name: string, path: string, extra: string[] = []): RepoDescriptor => ({
  id,
  name,
  path,
  headRef: 'main',
  worktrees: [worktree(id, path, true), ...extra.map((p) => worktree(id, p))],
});

const MIDNITE = repo('r1', 'midnite-studio', '/Users/x/Dev/midnite-studio', [
  '/Users/x/Dev/midnite-studio/.worktrees/theme-f',
]);
const OTHER = repo('r2', 'other', '/Users/x/Dev/other');

describe('resolveRepoForPath', () => {
  it('matches a repository root exactly', () => {
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio', [MIDNITE, OTHER])).toEqual({
      repoId: 'r1',
      repoName: 'midnite-studio',
      root: '/Users/x/Dev/midnite-studio',
    });
  });

  it('matches a descendant of a repository root', () => {
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio/packages/app', [MIDNITE])?.root).toBe(
      '/Users/x/Dev/midnite-studio',
    );
  });

  /*
    The reason the match is longest-prefix rather than first-wins: a linked
    worktree lives INSIDE its repository, so both roots prefix this path and
    the repository is the wrong answer.
  */
  it('prefers the nested worktree over the repository containing it', () => {
    expect(
      resolveRepoForPath('/Users/x/Dev/midnite-studio/.worktrees/theme-f/packages', [MIDNITE]),
    ).toEqual({
      repoId: 'r1',
      repoName: 'midnite-studio',
      root: '/Users/x/Dev/midnite-studio/.worktrees/theme-f',
    });
  });

  it('does not collapse two repositories whose worktrees nest', () => {
    const outer = repo('r3', 'outer', '/Users/x/Dev/outer');
    const inner = repo('r4', 'inner', '/Users/x/Dev/outer/vendor/inner');

    expect(resolveRepoForPath('/Users/x/Dev/outer/vendor/inner/src', [outer, inner])).toEqual({
      repoId: 'r4',
      repoName: 'inner',
      root: '/Users/x/Dev/outer/vendor/inner',
    });
    expect(resolveRepoForPath('/Users/x/Dev/outer/src', [outer, inner])?.repoId).toBe('r3');
  });

  /*
    A plain `startsWith` calls this a match, which would emphasise the wrong
    segment and claim the terminal is in a repository it has never been in.
  */
  it('respects the path separator boundary', () => {
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio-old/src', [MIDNITE])).toBeNull();
  });

  /*
    `/` is its own separator, so the `${base}/` prefix test would demand a
    doubled slash and a repository registered at the root would match nothing.
    It contains every absolute path — and, being the shortest possible root,
    loses to any other match under the longest-prefix rule.
  */
  it('handles a repository registered at the filesystem root', () => {
    const slash = repo('r5', 'root', '/');
    expect(resolveRepoForPath('/etc/hosts', [slash])?.root).toBe('/');
    expect(resolveRepoForPath('/', [slash])?.root).toBe('/');
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio/src', [slash, MIDNITE])?.repoId).toBe('r1');
  });

  it('returns null for a path inside no repository', () => {
    expect(resolveRepoForPath('/tmp/scratch', [MIDNITE, OTHER])).toBeNull();
  });

  it('returns null when there is nothing to match against', () => {
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio', [])).toBeNull();
    expect(resolveRepoForPath('/Users/x/Dev/midnite-studio', undefined)).toBeNull();
    expect(resolveRepoForPath(null, [MIDNITE])).toBeNull();
    expect(resolveRepoForPath('', [MIDNITE])).toBeNull();
  });
});
