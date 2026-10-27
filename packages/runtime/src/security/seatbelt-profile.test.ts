import { describe, expect, it } from 'vitest';

import { generateSeatbeltProfile, isUnder, sbString } from './seatbelt-profile';

const identity = (p: string): string => p;
const base = {
  repoRoots: ['/Users/u/Dev/app'],
  registryRepos: ['/Users/u/Dev/app', '/Users/u/Dev/other'],
  userData: '/Users/u/Library/Application Support/Midnite',
  protectedFiles: ['/Users/u/Library/Application Support/Midnite/secrets.vault.json'],
  protectedDirs: ['/Users/u/Library/Application Support/Midnite/security'],
  home: '/Users/u',
  tempDirs: ['/private/var/folders/xx/T'],
  realpath: identity,
};

describe('generateSeatbeltProfile', () => {
  const profile = generateSeatbeltProfile(base);

  it('starts writes closed and reopens them for the repo, userData, temp, caches and engine state', () => {
    expect(profile).toContain('(deny file-write*)');
    for (const allowed of [
      '/Users/u/Dev/app',
      '/Users/u/Library/Application Support/Midnite',
      '/private/var/folders/xx/T',
      '/Users/u/.cache',
      '/Users/u/.npm',
      '/Users/u/.pnpm-store',
      '/Users/u/.cargo',
      '/Users/u/.claude',
      '/Users/u/.codex',
    ]) {
      expect(profile).toContain(`(subpath "${allowed}")`);
    }
  });

  it('denies reads of credentials, the vault files and every other registered repo', () => {
    const denyBlock = profile.slice(profile.indexOf('(deny file-read*'), profile.indexOf('(allow file-read*'));
    for (const denied of ['/Users/u/.ssh', '/Users/u/.aws', '/Users/u/.gnupg', '/Users/u/Library/Keychains', '/Users/u/Dev/other']) {
      expect(denyBlock).toContain(`(subpath "${denied}")`);
    }
    expect(denyBlock).toContain('(literal "/Users/u/Library/Application Support/Midnite/secrets.vault.json")');
    // The session's own repo is not denied, only re-allowed after.
    expect(denyBlock).not.toContain('(subpath "/Users/u/Dev/app")');
    expect(profile.slice(profile.indexOf('(allow file-read*'))).toContain('(subpath "/Users/u/Dev/app")');
  });

  it('orders the protected-file deny after the userData allow, since the last match wins', () => {
    expect(profile.indexOf('(allow file-write*')).toBeLessThan(profile.lastIndexOf('(deny file-write*'));
  });

  it('leaves the network open by default and closes it, by port, on request', () => {
    expect(profile).not.toContain('network');
    const offline = generateSeatbeltProfile({ ...base, network: 'engine-hosts' });
    expect(offline).toContain('(deny network*)');
    expect(offline).toContain('"*:443"');
  });

  it('refuses a relative path and a control character', () => {
    expect(() => generateSeatbeltProfile({ ...base, repoRoots: ['relative/repo'] })).toThrow(/absolute/);
    expect(() => generateSeatbeltProfile({ ...base, repoRoots: ['/a\nb'] })).toThrow(/control/);
  });

  it('escapes quotes and backslashes in a path', () => {
    expect(sbString('/a"b\\c')).toBe('"/a\\"b\\\\c"');
  });

  it('writes nothing under a worktree that is not a root, and gives a non-repo session no repo write access', () => {
    const none = generateSeatbeltProfile({ ...base, repoRoots: [] });
    expect(none).not.toContain('(allow file-read*');
    expect(none.slice(none.indexOf('(allow file-write*'), none.indexOf(')\n', none.indexOf('(allow file-write*')))).not.toContain('/Users/u/Dev/app');
  });
});

describe('isUnder', () => {
  it('matches the path and its children, not a sibling with a shared prefix', () => {
    expect(isUnder('/a/b', '/a/b')).toBe(true);
    expect(isUnder('/a/b/c', '/a/b')).toBe(true);
    expect(isUnder('/a/bc', '/a/b')).toBe(false);
  });
});
