import { describe, expect, it } from 'vitest';

import { splitHeaderPath } from './header-path';
import type { ResolvedRepoPath } from './resolve-repo-for-path';

const HOME = '/Users/bilolwabona';
const at = (root: string): ResolvedRepoPath => ({ repoId: 'r1', repoName: 'midnite-git', root });

describe('splitHeaderPath', () => {
  it('splits at the repository root, `~`-collapsing the ancestors', () => {
    expect(splitHeaderPath(`${HOME}/Dev/midnite-git`, HOME, at(`${HOME}/Dev/midnite-git`))).toEqual({
      head: '~/Dev/',
      tail: 'midnite-git',
      emphasised: true,
    });
  });

  it('keeps everything below the checkout in the tail', () => {
    expect(
      splitHeaderPath(
        `${HOME}/Dev/midnite-git/packages/app`,
        HOME,
        at(`${HOME}/Dev/midnite-git`),
      ),
    ).toEqual({ head: '~/Dev/', tail: 'midnite-git/packages/app', emphasised: true });
  });

  it('splits at the nested worktree, not the repository containing it', () => {
    const root = `${HOME}/Dev/midnite-git/.worktrees/theme-f`;
    expect(splitHeaderPath(`${root}/packages/app`, HOME, at(root))).toEqual({
      head: '~/Dev/midnite-git/.worktrees/',
      tail: 'theme-f/packages/app',
      emphasised: true,
    });
  });

  it('leaves a path outside home uncollapsed', () => {
    expect(splitHeaderPath('/tmp/midnite-git/pkg', HOME, at('/tmp/midnite-git'))).toEqual({
      head: '/tmp/',
      tail: 'midnite-git/pkg',
      emphasised: true,
    });
  });

  /*
    The case the naive `path.length - splitAt` arithmetic gets wrong: a
    dotfiles repository registered AT the home directory. Slicing the collapsed
    string from the right by a length measured on the raw one splits
    `~/Dev/midnite-git` into `~/Dev/m` + `idnite-git` — an emphasis boundary in
    the middle of a word, and left-truncation then eating into the repo name.
  */
  it('does not split mid-word when the checkout IS the home directory', () => {
    expect(splitHeaderPath(`${HOME}/Dev/midnite-git`, HOME, at(HOME))).toEqual({
      head: '',
      tail: '~/Dev/midnite-git',
      emphasised: true,
    });
  });

  it('does not split mid-word when the checkout is an ancestor of home', () => {
    expect(splitHeaderPath(`${HOME}/Dev`, HOME, at('/'))).toEqual({
      head: '',
      tail: '~/Dev',
      emphasised: true,
    });
  });

  /*
    Left-truncation is unconditional in the phase doc — "a deep path keeps its
    tail" says nothing about being inside a repository. So the split still
    happens with no match; only the emphasis is withheld.
  */
  it('splits on the last segment with no repository match, and withholds emphasis', () => {
    expect(splitHeaderPath(`${HOME}/Downloads/some/deep/scratch`, HOME, null)).toEqual({
      head: '~/Downloads/some/deep/',
      tail: 'scratch',
      emphasised: false,
    });
  });

  it('handles a path with no ancestors to give away', () => {
    expect(splitHeaderPath('/tmp', null, null)).toEqual({
      head: '/',
      tail: 'tmp',
      emphasised: false,
    });
  });

  it('collapses home exactly to a bare tilde', () => {
    expect(splitHeaderPath(HOME, HOME, null)).toEqual({
      head: '',
      tail: '~',
      emphasised: false,
    });
  });

  it('passes the path through when home is unknown', () => {
    expect(splitHeaderPath(`${HOME}/Dev/midnite-git`, null, at(`${HOME}/Dev/midnite-git`))).toEqual(
      { head: '/Users/bilolwabona/Dev/', tail: 'midnite-git', emphasised: true },
    );
  });

  it('reassembles to the collapsed path in every case', () => {
    const cases: Array<[string, ResolvedRepoPath | null]> = [
      [`${HOME}/Dev/midnite-git/packages/app`, at(`${HOME}/Dev/midnite-git`)],
      [`${HOME}/Dev/midnite-git`, at(HOME)],
      [`${HOME}/Downloads/x`, null],
      ['/tmp/a/b', at('/tmp')],
      ['/tmp/a/b', at('/')],
      [HOME, at(HOME)],
    ];
    for (const [path, match] of cases) {
      const { head, tail } = splitHeaderPath(path, HOME, match);
      expect(head + tail, path).toBe(
        path.startsWith(`${HOME}/`) || path === HOME ? `~${path.slice(HOME.length)}` : path,
      );
    }
  });
});
