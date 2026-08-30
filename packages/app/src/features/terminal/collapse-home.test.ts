import { describe, expect, it } from 'vitest';

import { collapseHome } from './collapse-home';

const HOME = '/Users/bilolwabona';

describe('collapseHome', () => {
  it('collapses home exactly', () => {
    expect(collapseHome(HOME, HOME)).toBe('~');
  });

  it('collapses a child of home', () => {
    expect(collapseHome(`${HOME}/Dev`, HOME)).toBe('~/Dev');
    expect(collapseHome(`${HOME}/Dev/midnite-studio/.worktrees/x`, HOME)).toBe(
      '~/Dev/midnite-studio/.worktrees/x',
    );
  });

  it('leaves a path outside home alone', () => {
    expect(collapseHome('/tmp/midnite-studio', HOME)).toBe('/tmp/midnite-studio');
    expect(collapseHome('/', HOME)).toBe('/');
  });

  /*
    The reason this helper exists rather than a one-line `.replace()`. A prefix
    match with no boundary check rewrites another user's home directory as if
    it were yours, and the result reads plausibly enough to go unnoticed.
  */
  it('does not treat a longer sibling of home as home', () => {
    expect(collapseHome('/Users/bilolwabonaX/Dev', HOME)).toBe('/Users/bilolwabonaX/Dev');
    expect(collapseHome('/Users/bilolwabonaX', HOME)).toBe('/Users/bilolwabonaX');
  });

  it('tolerates a trailing slash on the home path', () => {
    expect(collapseHome(`${HOME}/Dev`, `${HOME}/`)).toBe('~/Dev');
    expect(collapseHome(HOME, `${HOME}/`)).toBe('~');
  });

  it('passes the path through when home is unknown', () => {
    expect(collapseHome(`${HOME}/Dev`, null)).toBe(`${HOME}/Dev`);
    expect(collapseHome(`${HOME}/Dev`, undefined)).toBe(`${HOME}/Dev`);
    expect(collapseHome(`${HOME}/Dev`, '')).toBe(`${HOME}/Dev`);
  });

  it('leaves an empty path empty', () => {
    expect(collapseHome('', HOME)).toBe('');
  });
});
