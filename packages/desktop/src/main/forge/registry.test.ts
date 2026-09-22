import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { forgeAccountToken } from './forge-accounts';
import { adapterFor } from './registry';

vi.mock('./forge-accounts', () => ({
  forgeAccountToken: vi.fn(),
}));

function forge(kind: Forge['kind']): Forge {
  return { host: `${kind}.example`, owner: 'o', repo: 'r', kind };
}

function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'gitlab:gitlab.example:me',
    kind: 'gitlab',
    host: 'gitlab.example',
    login: 'me',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

describe('adapterFor', () => {
  it('always returns a GitHub adapter, account or not', async () => {
    const adapter = await adapterFor(forge('github'), null);
    expect(adapter?.kind).toBe('github');
  });

  it('returns a GitLab adapter once a token resolves', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('glpat-x');
    const adapter = await adapterFor(forge('gitlab'), account());
    expect(adapter?.kind).toBe('gitlab');
  });

  it('returns null for GitLab with no account at all', async () => {
    const adapter = await adapterFor(forge('gitlab'), null);
    expect(adapter).toBeNull();
  });

  it('returns null for GitLab when the vault has no token for the account', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue(null);
    const adapter = await adapterFor(forge('gitlab'), account());
    expect(adapter).toBeNull();
  });

  it('returns null for a kind with no adapter yet', async () => {
    expect(await adapterFor(forge('bitbucket'), null)).toBeNull();
    expect(await adapterFor(forge('azure'), null)).toBeNull();
    expect(await adapterFor(forge('unknown'), null)).toBeNull();
  });
});
