import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgeAccountsState } from './forge-accounts-store';
import type { ForgeAccountsStore } from './forge-accounts-store';
import type { ForgeAccountVault } from './forge-account-vault';

const { ghStatusMock } = vi.hoisted(() => ({ ghStatusMock: vi.fn() }));
vi.mock('./gh-shell', () => ({ ghStatus: ghStatusMock }));

const { whoamiMock } = vi.hoisted(() => ({ whoamiMock: vi.fn() }));
vi.mock('./whoami', () => ({ whoami: whoamiMock }));

import {
  activeAccountFor,
  addForgeAccount,
  configureForgeAccounts,
  forgeAccountToken,
  getActiveAccount,
  listForgeAccounts,
  removeForgeAccount,
  switchActiveForgeAccount,
  __resetForgeAccountsForTests,
} from './forge-accounts';

function memoryStore(): ForgeAccountsStore & { state: ForgeAccountsState } {
  const store = {
    state: { accounts: [], activeAccountId: null } as ForgeAccountsState,
    load: async () => store.state,
    save: async (next: ForgeAccountsState) => {
      store.state = next;
    },
  };
  return store;
}

function memoryVault(): ForgeAccountVault & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    isAvailable: () => true,
    get: async (key) => entries.get(key) ?? null,
    set: async (key, token) => {
      entries.set(key, token);
    },
    delete: async (key) => {
      entries.delete(key);
    },
  };
}

beforeEach(() => {
  __resetForgeAccountsForTests();
  ghStatusMock.mockReset();
  whoamiMock.mockReset();
});

describe('addForgeAccount', () => {
  it('rejects a non-GitHub kind with no token, without calling whoami', async () => {
    configureForgeAccounts(memoryStore(), memoryVault());
    const result = await addForgeAccount('gitlab', 'gitlab.com');
    expect(result.ok).toBe(false);
    expect(whoamiMock).not.toHaveBeenCalled();
  });

  it('rejects a token whoami cannot validate, and stores nothing', async () => {
    whoamiMock.mockResolvedValue(null);
    configureForgeAccounts(memoryStore(), memoryVault());
    const result = await addForgeAccount('gitlab', 'gitlab.com', 'bad-token');
    expect(result.ok).toBe(false);
    expect(await listForgeAccounts()).toEqual([]);
  });

  it('stores a validated non-GitHub account and its token, and makes it active', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'The Octocat', avatarUrl: null });
    const vault = memoryVault();
    configureForgeAccounts(memoryStore(), vault);

    const result = await addForgeAccount('gitlab', 'gitlab.com', 'glpat-abc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.account.hasToken).toBe(true);
    expect(result.account.delegated).toBeNull();
    expect(vault.entries.get('gitlab:gitlab.com:octocat')).toBe('glpat-abc');
    expect(await getActiveAccount()).toEqual(result.account);
  });

  it('never puts the token itself on the returned account', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'The Octocat', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    const result = await addForgeAccount('gitlab', 'gitlab.com', 'glpat-abc');
    expect(result.ok && JSON.stringify(result.account)).not.toContain('glpat-abc');
  });

  it('discovers a GitHub account with no token, delegated to gh', async () => {
    ghStatusMock.mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' });
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'The Octocat', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());

    const result = await addForgeAccount('github', 'github.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.hasToken).toBe(false);
    expect(result.account.delegated).toBe('gh');
  });

  it('rejects a GitHub discovery when gh is not signed in', async () => {
    ghStatusMock.mockResolvedValue({ reason: 'not-authenticated', binPath: '/usr/bin/gh', hint: 'sign in' });
    configureForgeAccounts(memoryStore(), memoryVault());
    const result = await addForgeAccount('github', 'github.com');
    expect(result.ok).toBe(false);
    expect(whoamiMock).not.toHaveBeenCalled();
  });

  it('replaces rather than duplicates on re-add of the same identity', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'v1', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    await addForgeAccount('gitlab', 'gitlab.com', 'token-1');

    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'v2', avatarUrl: null });
    await addForgeAccount('gitlab', 'gitlab.com', 'token-2');

    const accounts = await listForgeAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.displayName).toBe('v2');
  });
});

describe('removeForgeAccount', () => {
  it('removes the account and its vaulted token', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'x', avatarUrl: null });
    const vault = memoryVault();
    configureForgeAccounts(memoryStore(), vault);
    const added = await addForgeAccount('gitlab', 'gitlab.com', 'glpat-abc');
    if (!added.ok) throw new Error('setup failed');

    expect(await removeForgeAccount(added.account.id)).toBe(true);
    expect(await listForgeAccounts()).toEqual([]);
    expect(vault.entries.has('gitlab:gitlab.com:octocat')).toBe(false);
  });

  it('clears the active pointer when the active account is removed', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'x', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    const added = await addForgeAccount('gitlab', 'gitlab.com', 'glpat-abc');
    if (!added.ok) throw new Error('setup failed');

    await removeForgeAccount(added.account.id);
    expect(await getActiveAccount()).toBeNull();
  });
});

describe('switchActiveForgeAccount', () => {
  it('moves the pointer to an existing account', async () => {
    whoamiMock.mockResolvedValue({ login: 'a', displayName: 'A', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    const first = await addForgeAccount('gitlab', 'gitlab.com', 't1');
    whoamiMock.mockResolvedValue({ login: 'b', displayName: 'B', avatarUrl: null });
    const second = await addForgeAccount('gitlab', 'gitlab.com', 't2');
    if (!first.ok || !second.ok) throw new Error('setup failed');

    const result = await switchActiveForgeAccount(first.account.id);
    expect(result).toEqual({ ok: true, activeAccountId: first.account.id });
  });

  it('refuses to switch to an id that is not a stored account', async () => {
    configureForgeAccounts(memoryStore(), memoryVault());
    const result = await switchActiveForgeAccount('nonexistent');
    expect(result.ok).toBe(false);
  });

  it('accepts null to clear the active pointer', async () => {
    whoamiMock.mockResolvedValue({ login: 'a', displayName: 'A', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    await addForgeAccount('gitlab', 'gitlab.com', 't1');

    const result = await switchActiveForgeAccount(null);
    expect(result).toEqual({ ok: true, activeAccountId: null });
    expect(await getActiveAccount()).toBeNull();
  });
});

describe('forgeAccountToken / activeAccountFor', () => {
  it('never resolves a token for a delegated (gh) account', async () => {
    ghStatusMock.mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' });
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'x', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    const added = await addForgeAccount('github', 'github.com');
    if (!added.ok) throw new Error('setup failed');

    expect(await forgeAccountToken(added.account)).toBeNull();
  });

  it('activeAccountFor matches only the active account whose host equals the forge', async () => {
    whoamiMock.mockResolvedValue({ login: 'octocat', displayName: 'x', avatarUrl: null });
    configureForgeAccounts(memoryStore(), memoryVault());
    const added = await addForgeAccount('gitlab', 'gitlab.com', 'glpat-abc');
    if (!added.ok) throw new Error('setup failed');

    const matched = await activeAccountFor({
      host: 'gitlab.com',
      owner: 'someone',
      repo: 'thing',
      kind: 'gitlab',
    });
    expect(matched?.id).toBe(added.account.id);

    const unmatched = await activeAccountFor({
      host: 'github.com',
      owner: 'someone',
      repo: 'thing',
      kind: 'github',
    });
    expect(unmatched).toBeNull();
  });
});
