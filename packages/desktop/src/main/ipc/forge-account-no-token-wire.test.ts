import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgeAccountSchema } from '@midnite/studio-shared';

/**
 * Phase 90 Theme K — "no forge token ever crosses the bridge", the
 * invariant the phase doc's own Verification section names as the one this
 * phase would most regret shipping without a test for, for **any provider,
 * on any channel**.
 *
 * `packages/shared/src/domain/forge-account.test.ts` already asserts this at
 * the schema-shape level (`ForgeAccountSchema.shape` has no `token` field),
 * and `forge-accounts.test.ts` already asserts one provider's `addForgeAccount`
 * never puts a token on its own return value. Neither goes all the way to
 * the wire: this test wires the REAL `forge-accounts.ts` registry (not the
 * mocked-out version `forge-account-handlers.test.ts` uses) behind the real
 * `registerForgeAccountHandlers`, adds a real account for every supported
 * provider with a distinct, real-looking token, and inspects the literal
 * `mstudio:forge:accounts` channel response — both by string search for
 * every token that was ever set, and by re-validating every returned
 * account against `ForgeAccountSchema.strict()`, which would catch a
 * future regression that bolts an extra field onto the object even though
 * the schema itself declares none.
 */

const invokeHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      invokeHandlers.set(channel, fn);
    }),
  },
}));

// Real `whoami` never runs a network call in this test — every kind resolves
// deterministically from the token it was handed, the same shape a real PAT
// validation would settle on, but with no HTTP involved.
vi.mock('../forge/whoami', () => ({
  whoami: vi.fn(async (kind: string, _host: string, token?: string) => {
    if (kind === 'github' && !token) return { login: 'octocat', displayName: 'The Octocat', avatarUrl: null };
    if (!token) return null;
    return { login: `${kind}-user`, displayName: `${kind} user`, avatarUrl: null };
  }),
}));
vi.mock('../forge/github/gh-shell', () => ({
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
  switchGhAccount: vi.fn(),
}));
vi.mock('../forge/reachable-repos', () => ({ listReachableRepos: vi.fn() }));
vi.mock('../settings-mirror', () => ({ currentSettings: vi.fn(() => ({})) }));

const TOKENS = {
  gitlab: 'glpat-real-looking-secret-0001',
  bitbucket: 'bb-app-password-secret-0002',
  azure: 'azure-devops-pat-secret-0003',
} as const;

const CHANNEL = 'mstudio:forge:accounts';

describe('no forge token ever crosses the mstudio:forge:accounts wire', () => {
  beforeEach(() => {
    invokeHandlers.clear();
    vi.resetModules();
  });

  it('never leaks a real vaulted token, for any of the four providers', async () => {
    const { configureForgeAccounts, addForgeAccount, __resetForgeAccountsForTests } = await import(
      '../forge/forge-accounts'
    );
    const { registerForgeAccountHandlers } = await import('./forge-account-handlers');

    __resetForgeAccountsForTests();

    const state: { accounts: unknown[]; activeAccountId: string | null } = { accounts: [], activeAccountId: null };
    const memoryStore = {
      load: async () => state as never,
      save: async (next: never) => {
        Object.assign(state, next);
      },
    };
    const vaultEntries = new Map<string, string>();
    const memoryVault = {
      isAvailable: () => true,
      get: async (key: string) => vaultEntries.get(key) ?? null,
      set: async (key: string, token: string) => {
        vaultEntries.set(key, token);
      },
      delete: async (key: string) => {
        vaultEntries.delete(key);
      },
    };
    configureForgeAccounts(memoryStore as never, memoryVault as never);

    // GitHub is delegated (no token at all — `gh` itself is the credential),
    // and the other three each get a real, distinct token.
    await addForgeAccount('github', 'github.com');
    await addForgeAccount('gitlab', 'gitlab.com', TOKENS.gitlab);
    await addForgeAccount('bitbucket', 'bitbucket.org', TOKENS.bitbucket);
    await addForgeAccount('azure', 'dev.azure.com', TOKENS.azure);

    registerForgeAccountHandlers();
    const response = await invokeHandlers.get(CHANNEL)!({}, {});
    const serialised = JSON.stringify(response);

    for (const token of Object.values(TOKENS)) {
      expect(serialised).not.toContain(token);
    }

    expect(Array.isArray(response)).toBe(true);
    const accounts = response as unknown[];
    expect(accounts).toHaveLength(4);
    for (const account of accounts) {
      const parsed = ForgeAccountSchema.strict().safeParse(account);
      expect(parsed.success).toBe(true);
    }
  });
});
