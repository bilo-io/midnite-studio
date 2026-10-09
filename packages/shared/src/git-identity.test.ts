import { describe, expect, it } from 'vitest';

import { GitIdentitySetRequest, prefillGitIdentity } from './git-identity';

describe('GitIdentitySetRequest', () => {
  it('trims and accepts a normal identity', () => {
    expect(GitIdentitySetRequest.parse({ name: '  Ada  ', email: ' ada@example.com ' })).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
    });
  });

  it.each([
    [{ name: '', email: 'a@b.co' }],
    [{ name: 'Ada', email: 'not-an-email' }],
    [{ name: 'Ada', email: 'a b@c.d' }],
    [{ name: 'Ada', email: '<a@b.co>' }],
    [{ name: 'Ada' }],
  ])('rejects %j', (payload) => {
    expect(GitIdentitySetRequest.safeParse(payload).success).toBe(false);
  });
});

describe('prefillGitIdentity', () => {
  const current = { name: 'Git Name', email: 'git@example.com' };

  it('keeps what git has when no account is selected', () => {
    expect(prefillGitIdentity(null, current)).toEqual(current);
  });

  it('prefers the account email, then the git config email, never a guess', () => {
    expect(prefillGitIdentity({ login: 'ada', displayName: 'Ada L', email: 'ada@forge.io' }, current)).toEqual({
      name: 'Ada L',
      email: 'ada@forge.io',
    });
    expect(prefillGitIdentity({ login: 'ada', displayName: 'Ada L', email: null }, current).email).toBe('git@example.com');
    expect(prefillGitIdentity({ login: 'ada', displayName: 'Ada L' }, { name: '', email: '' }).email).toBe('');
  });

  it('falls back from display name to login to the git name', () => {
    expect(prefillGitIdentity({ login: 'ada', displayName: '  ' }, current).name).toBe('ada');
    expect(prefillGitIdentity({ login: '', displayName: '' }, current).name).toBe('Git Name');
  });
});
