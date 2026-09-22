import { describe, expect, it } from 'vitest';

import type { Forge, ForgeAccount } from '@midnite/studio-shared';

import { isRepoVisibleForAccount } from './forge-account-scope';

const forge = (overrides: Partial<Forge> = {}): Forge => ({
  host: 'github.com',
  owner: 'octocat',
  repo: 'hello-world',
  kind: 'github',
  ...overrides,
});

const account = (overrides: Partial<ForgeAccount> = {}): ForgeAccount => ({
  id: 'github:github.com:octocat',
  kind: 'github',
  host: 'github.com',
  login: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: null,
  addedAt: 0,
  hasToken: false,
  delegated: 'gh',
  ...overrides,
});

describe('isRepoVisibleForAccount', () => {
  it('stays visible with no active account — scoping has nothing to scope to', () => {
    expect(isRepoVisibleForAccount(forge(), null, null)).toBe(true);
  });

  it('stays visible for a repo with no recognised forge remote', () => {
    expect(isRepoVisibleForAccount(null, account(), null)).toBe(true);
  });

  it('hides a repo whose host does not match the active account', () => {
    const gitlabRepo = forge({ host: 'gitlab.com', kind: 'gitlab' });
    expect(isRepoVisibleForAccount(gitlabRepo, account(), null)).toBe(false);
  });

  it('stays visible when the owner is the active account itself, case-insensitively', () => {
    expect(isRepoVisibleForAccount(forge({ owner: 'Octocat' }), account(), null)).toBe(true);
  });

  it('stays visible for an org-owned repo when no reachable listing has resolved yet', () => {
    // No evidence either way — the phase doc's own worry about a false hide.
    expect(isRepoVisibleForAccount(forge({ owner: 'some-org' }), account(), null)).toBe(true);
  });

  it('stays visible for an org repo the reachable listing confirms', () => {
    const orgRepo = forge({ owner: 'some-org', repo: 'widgets' });
    expect(
      isRepoVisibleForAccount(orgRepo, account(), [{ owner: 'some-org', name: 'widgets' }]),
    ).toBe(true);
  });

  it('hides an org repo the reachable listing does not list', () => {
    const orgRepo = forge({ owner: 'some-org', repo: 'widgets' });
    expect(
      isRepoVisibleForAccount(orgRepo, account(), [{ owner: 'other-org', name: 'other-repo' }]),
    ).toBe(false);
  });
});
