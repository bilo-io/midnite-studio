import { describe, expect, it } from 'vitest';

import {
  ForgeAccountSchema,
  capabilitiesFor,
  forgeAccountId,
  forgeAccountVaultKey,
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

describe('capabilitiesFor', () => {
  it('reports full capability for github', () => {
    const capability = capabilitiesFor('github');
    expect(Object.values(capability).every((level) => level === 'full')).toBe(true);
  });

  it('reports no capability for every other kind — Theme B ships accounts, not adapters', () => {
    for (const kind of ['gitlab', 'bitbucket', 'azure', 'unknown'] as const) {
      const capability = capabilitiesFor(kind);
      expect(Object.values(capability).every((level) => level === 'none')).toBe(true);
    }
  });
});
