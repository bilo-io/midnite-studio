import { describe, expect, it } from 'vitest';

import {
  bumpLevelFromCommits,
  compareSemVer,
  parseConventionalCommit,
  planReleaseTags,
  planVersionBump,
  sharesLockstepMajorMinor,
  versionFromReleaseBranch,
} from './version';

const REPO = {
  '@midnite/studio': '0.3.0',
  '@midnite/studio-shared': '0.3.0',
  '@midnite/studio-desktop': '0.3.2',
  '@midnite/studio-app': '0.3.1',
};

describe('planVersionBump', () => {
  it('moves ALL packages to X.(Y+1).0 on a lockstep minor', () => {
    expect(
      planVersionBump(REPO, { level: 'minor', changedPackages: ['@midnite/studio-desktop'] }),
    ).toEqual({
      '@midnite/studio': '0.4.0',
      '@midnite/studio-shared': '0.4.0',
      '@midnite/studio-desktop': '0.4.0',
      '@midnite/studio-app': '0.4.0',
    });
  });

  it('moves ALL packages to (X+1).0.0 on a lockstep major', () => {
    expect(planVersionBump(REPO, { level: 'major', changedPackages: [] })).toEqual({
      '@midnite/studio': '1.0.0',
      '@midnite/studio-shared': '1.0.0',
      '@midnite/studio-desktop': '1.0.0',
      '@midnite/studio-app': '1.0.0',
    });
  });

  it('bumps only the changed packages on a patch, leaving others unchanged', () => {
    expect(
      planVersionBump(REPO, {
        level: 'patch',
        changedPackages: ['@midnite/studio-desktop', '@midnite/studio-app'],
      }),
    ).toEqual({
      '@midnite/studio': '0.3.0',
      '@midnite/studio-shared': '0.3.0',
      '@midnite/studio-desktop': '0.3.3',
      '@midnite/studio-app': '0.3.2',
    });
  });

  it('ignores unknown package names in a patch change set', () => {
    expect(
      planVersionBump(REPO, { level: 'patch', changedPackages: ['@midnite/does-not-exist'] }),
    ).toEqual(REPO);
  });

  it('is idempotent on a `none` change set', () => {
    expect(planVersionBump(REPO, { level: 'none', changedPackages: [] })).toEqual(REPO);
    // returns a copy, not the same reference
    expect(planVersionBump(REPO, { level: 'none', changedPackages: [] })).not.toBe(REPO);
  });

  it('throws when the current versions are not in lockstep', () => {
    expect(() =>
      planVersionBump({ a: '0.3.0', b: '0.4.0' }, { level: 'minor', changedPackages: [] }),
    ).toThrow(/lockstep/);
  });

  it('handles an empty version map', () => {
    expect(planVersionBump({}, { level: 'minor', changedPackages: [] })).toEqual({});
  });
});

describe('sharesLockstepMajorMinor', () => {
  it('is true when every version shares one MAJOR.MINOR (patch may differ)', () => {
    expect(sharesLockstepMajorMinor(['0.3.0', '0.3.5'])).toBe(true);
  });

  it('is false when a MINOR diverges', () => {
    expect(sharesLockstepMajorMinor(['0.3.0', '0.4.0'])).toBe(false);
  });

  it('is false when a MAJOR diverges', () => {
    expect(sharesLockstepMajorMinor(['0.3.0', '1.3.0'])).toBe(false);
  });

  it('is trivially true for an empty or single-version list', () => {
    expect(sharesLockstepMajorMinor([])).toBe(true);
    expect(sharesLockstepMajorMinor(['2.7.4'])).toBe(true);
  });

  it('throws on a malformed version', () => {
    expect(() => sharesLockstepMajorMinor(['0.3', '0.3.0'])).toThrow(/invalid semver/);
  });
});

describe('compareSemVer', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemVer('0.1.3', '0.1.4')).toBe(-1);
    expect(compareSemVer('0.2.0', '0.1.9')).toBe(1);
    expect(compareSemVer('1.0.0', '0.9.9')).toBe(1);
    expect(compareSemVer('0.1.3', '0.1.3')).toBe(0);
  });

  it('throws on a malformed version', () => {
    expect(() => compareSemVer('0.1', '0.1.0')).toThrow(/invalid semver/);
  });
});

describe('parseConventionalCommit', () => {
  it('parses type, scope, breaking marker and description', () => {
    expect(parseConventionalCommit('feat(terminal)!: add drain-aware writes')).toEqual({
      type: 'feat',
      scope: 'terminal',
      breaking: true,
      description: 'add drain-aware writes',
      known: true,
    });
  });

  it('parses a scopeless, non-breaking commit', () => {
    expect(parseConventionalCommit('fix: stop dropping keystrokes')).toEqual({
      type: 'fix',
      scope: null,
      breaking: false,
      description: 'stop dropping keystrokes',
      known: true,
    });
  });

  it('flags an unrecognised type as known:false without failing to parse', () => {
    const parsed = parseConventionalCommit('oops: not a real type');
    expect(parsed?.known).toBe(false);
  });

  it('detects a BREAKING CHANGE footer even without a `!` marker', () => {
    const parsed = parseConventionalCommit('feat: new thing\n\nBREAKING CHANGE: drops old API');
    expect(parsed?.breaking).toBe(true);
  });

  it('is null for a subject that is not conventional-commit shaped', () => {
    expect(parseConventionalCommit('just a plain subject line')).toBeNull();
  });
});

describe('bumpLevelFromCommits', () => {
  const commit = (message: string) => parseConventionalCommit(message)!;

  it('is major when any commit is breaking', () => {
    expect(
      bumpLevelFromCommits([commit('fix: a'), commit('feat!: breaking one')]),
    ).toBe('major');
  });

  it('is minor when any commit is a feat and none is breaking', () => {
    expect(bumpLevelFromCommits([commit('fix: a'), commit('feat: b')])).toBe('minor');
  });

  it('is patch when only fixes are present', () => {
    expect(bumpLevelFromCommits([commit('fix: a'), commit('fix: b')])).toBe('patch');
  });

  it('is none when nothing is release-worthy', () => {
    expect(bumpLevelFromCommits([commit('docs: a'), commit('chore: b')])).toBe('none');
  });

  it('is none for an empty commit list', () => {
    expect(bumpLevelFromCommits([])).toBe('none');
  });
});

describe('planReleaseTags', () => {
  it('plans a single lockstep tag for a minor/major bump', () => {
    const previous = { '@midnite/studio': '0.3.0', '@midnite/studio-shared': '0.3.0' };
    const next = { '@midnite/studio': '0.4.0', '@midnite/studio-shared': '0.4.0' };
    expect(planReleaseTags(previous, next)).toEqual(['v0.4.0']);
  });

  it('plans one scoped tag per bumped package on an independent patch', () => {
    const previous = { '@midnite/studio-desktop': '0.3.0', '@midnite/studio-app': '0.3.1' };
    const next = { '@midnite/studio-desktop': '0.3.1', '@midnite/studio-app': '0.3.1' };
    expect(planReleaseTags(previous, next)).toEqual(['@midnite/studio-desktop@0.3.1']);
  });

  it('returns an empty list when nothing changed', () => {
    const versions = { '@midnite/studio': '0.3.0' };
    expect(planReleaseTags(versions, { ...versions })).toEqual([]);
  });

  it('plans a single lockstep tag for the first-ever release (no previous)', () => {
    const next = { '@midnite/studio': '0.1.0', '@midnite/studio-shared': '0.1.0' };
    expect(planReleaseTags({}, next)).toEqual(['v0.1.0']);
  });

  it('throws when the previous versions were not in lockstep', () => {
    expect(() =>
      planReleaseTags({ a: '0.3.0', b: '0.4.0' }, { a: '0.3.1', b: '0.4.0' }),
    ).toThrow(/lockstep/);
  });
});

describe('versionFromReleaseBranch', () => {
  it('extracts X.Y.Z from a release/vX.Y.Z branch name', () => {
    expect(versionFromReleaseBranch('release/v0.1.0')).toBe('0.1.0');
  });

  it('is null for a branch that is not a release branch', () => {
    expect(versionFromReleaseBranch('feature/p53-bcd')).toBeNull();
    expect(versionFromReleaseBranch('main')).toBeNull();
  });
});
