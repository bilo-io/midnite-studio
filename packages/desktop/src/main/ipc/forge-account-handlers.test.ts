import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgeAccount } from '@midnite/studio-shared';

/*
  Same arrangement `browser-handlers.test.ts`/`forge-project-handlers.test.ts`
  use: `ipcMain.handle` is captured so each registered handler can be invoked
  directly, with every module `forge-account-handlers.ts` depends on mocked
  at the seam.
*/
const invokeHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      invokeHandlers.set(channel, fn);
    }),
  },
}));

const {
  addForgeAccount,
  listForgeAccounts,
  removeForgeAccount,
  switchActiveForgeAccount,
} = vi.hoisted(() => ({
  addForgeAccount: vi.fn(),
  listForgeAccounts: vi.fn(),
  removeForgeAccount: vi.fn(),
  switchActiveForgeAccount: vi.fn(),
}));
vi.mock('../forge/forge-accounts', () => ({
  addForgeAccount,
  listForgeAccounts,
  removeForgeAccount,
  switchActiveForgeAccount,
}));

const { switchGhAccount } = vi.hoisted(() => ({ switchGhAccount: vi.fn() }));
vi.mock('../forge/github/gh-shell', () => ({ switchGhAccount }));

const { listReachableRepos } = vi.hoisted(() => ({ listReachableRepos: vi.fn() }));
vi.mock('../forge/reachable-repos', () => ({ listReachableRepos }));

const { currentSettings } = vi.hoisted(() => ({ currentSettings: vi.fn() }));
vi.mock('../settings-mirror', () => ({ currentSettings }));

async function loadHandlers(): Promise<void> {
  const { registerForgeAccountHandlers } = await import('./forge-account-handlers');
  registerForgeAccountHandlers();
}

const githubAccount = (overrides: Partial<ForgeAccount> = {}): ForgeAccount => ({
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

const CHANNEL = 'mstudio:forge:account-switch';
const REACHABLE_CHANNEL = 'mstudio:forge:account-reachable-repos';

async function callSwitch(id: string | null): Promise<unknown> {
  return invokeHandlers.get(CHANNEL)!({}, { id });
}

beforeEach(async () => {
  invokeHandlers.clear();
  addForgeAccount.mockReset();
  listForgeAccounts.mockReset();
  removeForgeAccount.mockReset();
  switchActiveForgeAccount.mockReset();
  switchGhAccount.mockReset();
  listReachableRepos.mockReset();
  currentSettings.mockReset();
  currentSettings.mockReturnValue({ forgeSyncGhAuthSwitch: true });
  await loadHandlers();
});

/*
  Phase 90 Theme C: `gh auth switch` is the one side effect this handler
  triggers beyond moving the pointer — every branch below is a reason it
  should, or should not, fire.
*/
describe('forgeAccountSwitch — gh auth switch gating', () => {
  it('runs gh auth switch for a delegated GitHub account when the setting is on', async () => {
    const account = githubAccount();
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: account.id });
    listForgeAccounts.mockResolvedValue([account]);
    switchGhAccount.mockResolvedValue({ ok: true });

    const result = await callSwitch(account.id);
    // The switch itself resolves before the gh call is awaited (fire-and-forget).
    await Promise.resolve();
    await Promise.resolve();

    expect(result).toEqual({ ok: true, activeAccountId: account.id });
    expect(switchGhAccount).toHaveBeenCalledWith('github.com', 'octocat');
  });

  it('never runs gh auth switch for a PAT-based second GitHub identity', async () => {
    const account = githubAccount({ id: 'github:github.com:second', login: 'second', delegated: null });
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: account.id });
    listForgeAccounts.mockResolvedValue([account]);

    await callSwitch(account.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).not.toHaveBeenCalled();
  });

  it('never runs gh auth switch for a non-GitHub account', async () => {
    const account = githubAccount({
      id: 'gitlab:gitlab.com:octocat',
      kind: 'gitlab',
      host: 'gitlab.com',
      delegated: null,
    });
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: account.id });
    listForgeAccounts.mockResolvedValue([account]);

    await callSwitch(account.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).not.toHaveBeenCalled();
  });

  it('never runs gh auth switch when forge.syncGhAuthSwitch is off', async () => {
    const account = githubAccount();
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: account.id });
    listForgeAccounts.mockResolvedValue([account]);
    currentSettings.mockReturnValue({ forgeSyncGhAuthSwitch: false });

    await callSwitch(account.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).not.toHaveBeenCalled();
  });

  it('treats a missing forgeSyncGhAuthSwitch field as on, not off', async () => {
    const account = githubAccount();
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: account.id });
    listForgeAccounts.mockResolvedValue([account]);
    currentSettings.mockReturnValue({});

    await callSwitch(account.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).toHaveBeenCalledWith('github.com', 'octocat');
  });

  it('never runs gh auth switch when the switch itself failed', async () => {
    switchActiveForgeAccount.mockResolvedValue({ ok: false, activeAccountId: null });

    await callSwitch('nope');
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).not.toHaveBeenCalled();
    expect(listForgeAccounts).not.toHaveBeenCalled();
  });

  it('never runs gh auth switch when clearing the active account (id: null)', async () => {
    switchActiveForgeAccount.mockResolvedValue({ ok: true, activeAccountId: null });

    await callSwitch(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(switchGhAccount).not.toHaveBeenCalled();
  });
});

describe('forgeAccountReachableRepos', () => {
  async function callReachable(accountId: string): Promise<unknown> {
    return invokeHandlers.get(REACHABLE_CHANNEL)!({}, { accountId });
  }

  it('answers no-account for an unknown id without calling listReachableRepos', async () => {
    listForgeAccounts.mockResolvedValue([]);

    const result = await callReachable('missing');

    expect(result).toEqual({ ok: false, reason: 'no-account' });
    expect(listReachableRepos).not.toHaveBeenCalled();
  });

  it('delegates to listReachableRepos for a known account', async () => {
    const account = githubAccount();
    listForgeAccounts.mockResolvedValue([account]);
    listReachableRepos.mockResolvedValue({ ok: true, repos: [] });

    const result = await callReachable(account.id);

    expect(listReachableRepos).toHaveBeenCalledWith(account);
    expect(result).toEqual({ ok: true, repos: [] });
  });
});
