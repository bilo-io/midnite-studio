import { describe, expect, it } from 'vitest';

import {
  ForgeAccountSchema,
  forgeAccountId,
  forgeAccountVaultKey,
  normalizeForgeAccountHost,
} from './forge-account';

const account = {
  id: forgeAccountId('gitlab', 'gitlab.com', 'octocat'),
  kind: 'gitlab' as const,
  host: 'gitlab.com',
  login: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: 'https://gitlab.com/avatar.png',
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

describe('ForgeAccountSchema', () => {
  // The invariant Phase 90's Verification section names as the one this
  // phase would most regret shipping without: no forge token ever crosses
  // the bridge. Asserted by schema, not by inspection.
  it('has no field that could carry a token', () => {
    expect(Object.keys(ForgeAccountSchema.shape)).not.toContain('token');
    expect(Object.keys(ForgeAccountSchema.shape).sort()).toEqual(
      ['addedAt', 'avatarUrl', 'delegated', 'displayName', 'hasToken', 'host', 'id', 'kind', 'login'].sort(),
    );
  });

  it('parses a well-formed non-GitHub account', () => {
    expect(ForgeAccountSchema.safeParse(account).success).toBe(true);
  });

  it('rejects `unknown` as a kind — an account always names a supported forge', () => {
    const result = ForgeAccountSchema.safeParse({ ...account, kind: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a delegated value that is not `gh`', () => {
    const result = ForgeAccountSchema.safeParse({ ...account, delegated: 'something-else' });
    expect(result.success).toBe(false);
  });
});

describe('forgeAccountId / forgeAccountVaultKey', () => {
  it('is stable for the same identity', () => {
    expect(forgeAccountId('gitlab', 'gitlab.com', 'octocat')).toBe(
      forgeAccountId('gitlab', 'gitlab.com', 'octocat'),
    );
  });

  it('differs across kind, host or login', () => {
    const base = forgeAccountId('gitlab', 'gitlab.com', 'octocat');
    expect(forgeAccountId('bitbucket', 'gitlab.com', 'octocat')).not.toBe(base);
    expect(forgeAccountId('gitlab', 'self-hosted.example', 'octocat')).not.toBe(base);
    expect(forgeAccountId('gitlab', 'gitlab.com', 'someone-else')).not.toBe(base);
  });

  it('forgeAccountVaultKey matches the same shape', () => {
    expect(forgeAccountVaultKey('gitlab', 'gitlab.com', 'octocat')).toBe('gitlab:gitlab.com:octocat');
  });
});

describe('normalizeForgeAccountHost', () => {
  it('accepts a bare host unchanged', () => {
    expect(normalizeForgeAccountHost('gitlab.com')).toBe('gitlab.com');
    expect(normalizeForgeAccountHost('  gitlab.example.com  ')).toBe('gitlab.example.com');
  });

  it('accepts an https:// base URL and reduces it to the bare host', () => {
    expect(normalizeForgeAccountHost('https://gitlab.example.com')).toBe('gitlab.example.com');
    expect(normalizeForgeAccountHost('https://gitlab.example.com/')).toBe('gitlab.example.com');
  });

  it('rejects a non-https scheme on a base URL', () => {
    expect(normalizeForgeAccountHost('http://gitlab.example.com')).toBeNull();
    expect(normalizeForgeAccountHost('javascript:alert(1)')).toBeNull();
    expect(normalizeForgeAccountHost('file:///etc/passwd')).toBeNull();
  });

  it('rejects a base URL carrying a path, since `host` is hostname-only', () => {
    expect(normalizeForgeAccountHost('https://gitlab.example.com/some/path')).toBeNull();
  });

  it('rejects a base URL carrying userinfo', () => {
    expect(normalizeForgeAccountHost('https://user:pass@gitlab.example.com')).toBeNull();
  });

  it('rejects a bare host smuggling a path, userinfo or whitespace', () => {
    expect(normalizeForgeAccountHost('gitlab.example.com/evil')).toBeNull();
    expect(normalizeForgeAccountHost('user@gitlab.example.com')).toBeNull();
    expect(normalizeForgeAccountHost('gitlab example.com')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(normalizeForgeAccountHost('')).toBeNull();
    expect(normalizeForgeAccountHost('   ')).toBeNull();
  });
});
