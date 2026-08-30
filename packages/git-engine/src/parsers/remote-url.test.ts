import { describe, expect, it } from 'vitest';

import { parseRemoteUrl } from './remote-url';

/**
 * Table-driven because the interesting property is uniformity: five syntaxes
 * that git treats as the same remote must normalise to the same triple. A
 * per-case `it` hides that — the table makes a disagreement between two rows
 * that should match visible at a glance.
 */
const GITHUB = { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' };

describe('parseRemoteUrl', () => {
  it.each([
    ['scp-like with user', 'git@github.com:bilo-io/midnite-studio.git', GITHUB],
    ['scp-like without user', 'github.com:bilo-io/midnite-studio.git', GITHUB],
    ['scp-like without .git', 'git@github.com:bilo-io/midnite-studio', GITHUB],
    ['https', 'https://github.com/bilo-io/midnite-studio.git', GITHUB],
    ['https without .git', 'https://github.com/bilo-io/midnite-studio', GITHUB],
    ['https with trailing slash', 'https://github.com/bilo-io/midnite-studio/', GITHUB],
    ['ssh:// with explicit port', 'ssh://git@github.com:22/bilo-io/midnite-studio.git', GITHUB],
    ['ssh:// without port', 'ssh://git@github.com/bilo-io/midnite-studio.git', GITHUB],
    ['git://', 'git://github.com/bilo-io/midnite-studio.git', GITHUB],
    ['surrounding whitespace', '  git@github.com:bilo-io/midnite-studio.git\n', GITHUB],
  ])('normalises %s', (_label, url, expected) => {
    expect(parseRemoteUrl(url)).toEqual(expected);
  });

  it('recognises gitlab.com', () => {
    expect(parseRemoteUrl('git@gitlab.com:group/proj.git')).toEqual({
      host: 'gitlab.com',
      owner: 'group',
      repo: 'proj',
      kind: 'gitlab',
    });
  });

  it('keeps every subgroup segment in owner for a self-hosted GitLab', () => {
    // The failure this guards against is a subgroup URL losing its middle: an
    // `owner` of just `platform` builds a link to a project that does not exist.
    expect(parseRemoteUrl('https://gitlab.corp.example/platform/infra/tooling.git')).toEqual({
      host: 'gitlab.corp.example',
      owner: 'platform/infra',
      repo: 'tooling',
      kind: 'gitlab',
    });
  });

  it('treats a self-hosted GitHub Enterprise host as github', () => {
    expect(parseRemoteUrl('git@github.acme.com:team/svc.git')?.kind).toBe('github');
  });

  it.each([
    ['a host that merely ends with the name', 'notgithub.com'],
    ['a host that merely contains the name', 'mygithub.example'],
    // The classic lookalike: it has the leading `github.` label that the
    // self-hosted heuristic keys on AND embeds the canonical domain, so it
    // needs an explicit exclusion rather than falling out of the suffix check.
    ['a host prefixed with the canonical domain', 'github.com.evil.example'],
    ['the same trick on gitlab', 'gitlab.com.evil.example'],
  ])('does not treat %s as a forge', (_label, host) => {
    expect(parseRemoteUrl(`https://${host}/o/r.git`)?.kind).toBe('unknown');
  });

  it('ignores a trailing dot on a fully-qualified hostname', () => {
    // `github.com.` is the FQDN form and resolves identically; without stripping
    // it, every suffix comparison misses and a real GitHub remote reads unknown.
    expect(parseRemoteUrl('https://github.com./o/r.git')?.kind).toBe('github');
  });

  it('survives a malformed percent-escape in the path', () => {
    // `%` is legal in a repo name and `decodeURIComponent` throws on a bad
    // escape. A throw here escapes listRemotes and rejects the whole IPC call,
    // so one oddly-named repo would cost every remote its link.
    expect(parseRemoteUrl('https://github.com/team/100%uptime.git')).toEqual({
      host: 'github.com',
      owner: 'team',
      repo: '100%uptime',
      kind: 'github',
    });
  });

  it('degrades an unrecognised forge to kind unknown, not to null', () => {
    expect(parseRemoteUrl('git@git.sr.ht:~user/project')).toEqual({
      host: 'git.sr.ht',
      owner: 'user',
      repo: 'project',
      kind: 'unknown',
    });
  });

  it.each([
    ['an absolute filesystem path', '/srv/git/repo.git'],
    ['a relative filesystem path', '../sibling'],
    ['a file:// URL', 'file:///srv/git/repo.git'],
    ['a URL with no owner segment', 'https://github.com/repo.git'],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('returns null for %s', (_label, url) => {
    expect(parseRemoteUrl(url)).toBeNull();
  });

  it('percent-decodes a path segment', () => {
    expect(parseRemoteUrl('https://gitlab.com/my%20group/proj.git')?.owner).toBe('my group');
  });

  it('lower-cases only for matching, never in the returned host', () => {
    // The host is used to build a URL; rewriting its case is a change we have no
    // reason to make, and DNS is case-insensitive anyway.
    expect(parseRemoteUrl('git@GitHub.com:o/r.git')).toMatchObject({
      host: 'GitHub.com',
      kind: 'github',
    });
  });
});
