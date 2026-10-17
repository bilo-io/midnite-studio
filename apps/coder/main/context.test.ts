// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain, a temp vault and temp repos.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetForgeAccountsForTests, forgeManifest } from '@midnite/studio-feature-forge/main';
import { testsManifest } from '@midnite/studio-feature-tests/main';
import { createFakeCipher, createVaultGrants, createVaultService, type VaultAuthorize } from '@midnite/studio-runtime';
import { CHANNELS, forgeAccountVaultKey, type ForgeAccount } from '@midnite/studio-shared';

import { registerCoderHandlers } from './context';

const TOKEN = 'glpat-CODER-VAULT-SECRET';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coder-main-'));
  mkdirSync(join(dir, 'runtime'));
  __resetForgeAccountsForTests();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** A checkout whose `.git/config` names a GitLab origin — read as a file, never by running git. */
function makeRepo(name: string): string {
  const repo = join(dir, name);
  mkdirSync(join(repo, '.git'), { recursive: true });
  writeFileSync(join(repo, '.git', 'config'), '[remote "origin"]\n\turl = https://gitlab.example.com/team/widgets.git\n');
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return realpathSync(repo);
}

/** Registers Coder over a temp vault and userData; every outbound request lands on the injected fetch. */
async function setup(options: { authorize?: VaultAuthorize; picked?: string | null } = {}) {
  const cipher = createFakeCipher();
  const requests: { url: string; authorization: string | undefined }[] = [];
  const fetch = vi.fn(async (url: URL | string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    requests.push({ url: String(url), authorization: headers['PRIVATE-TOKEN'] ?? headers['Authorization'] });
    // GitLab's `whoami` answers a user; every listing answers empty.
    const body = String(url).endsWith('/api/v4/user') ? { username: 'me', name: 'Me', avatar_url: null } : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const sends = new Map<string, (event: unknown, raw: unknown) => void>();
  const { repos } = registerCoderHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void sends.set(c, l) },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: join(dir, 'userData'),
    vaultDirectory: join(dir, 'runtime'),
    cipher,
    pickDirectory: async () => options.picked ?? null,
    senderWindowId: () => 1,
    onWindowClosed: () => undefined,
    windows: { anyWindowVisible: () => false, idleState: () => 'active' },
    fetch,
    ...(options.authorize ? { authorize: options.authorize } : {}),
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)?.({}, payload);
  return { handlers, sends, invoke, requests, repos, cipher };
}

describe('registerCoderHandlers', () => {
  it('registers the forge and tests features’ channels and its own repository list — and nothing else', async () => {
    const { handlers, sends } = await setup();
    const own = [CHANNELS.repoList, CHANNELS.repoPickDirectory, CHANNELS.repoOpen, CHANNELS.repoClose, CHANNELS.remotesList];
    expect([...handlers.keys()].sort()).toEqual([...forgeManifest.ipc, ...testsManifest.ipc, ...own].sort());
    expect([...sends.keys()].sort()).toEqual([...forgeManifest.sends, ...testsManifest.sends].sort());
    for (const channel of [CHANNELS.secretsGet, CHANNELS.secretsSet, CHANNELS.secretsHas]) expect(handlers.has(channel)).toBe(false);
  });

  it('adds only a folder the dialog itself returned, and refuses a path the renderer made up', async () => {
    const repo = makeRepo('widgets');
    const { invoke } = await setup({ picked: repo });
    expect(await invoke(CHANNELS.repoOpen, { path: repo })).toMatchObject({ ok: false });
    expect(await invoke(CHANNELS.repoPickDirectory)).toBe(repo);
    expect(await invoke(CHANNELS.repoOpen, { path: '/etc' })).toMatchObject({ ok: false });
    const opened = (await invoke(CHANNELS.repoOpen, { path: repo })) as { ok: true; repo: { id: string; name: string; headRef: string } };
    expect(opened).toMatchObject({ ok: true, repo: { name: 'widgets', headRef: 'main' } });
    // Offered once: the same path a second time is not re-admitted without another pick.
    expect(await invoke(CHANNELS.repoOpen, { path: repo })).toMatchObject({ ok: false });
    expect(((await invoke(CHANNELS.repoList)) as unknown[]).length).toBe(1);
  });

  it('refuses a picked folder that is not a git checkout', async () => {
    const plain = join(dir, 'plain');
    mkdirSync(plain);
    const { invoke } = await setup({ picked: plain });
    await invoke(CHANNELS.repoPickDirectory);
    expect(await invoke(CHANNELS.repoOpen, { path: plain })).toMatchObject({ ok: false, message: expect.stringMatching(/not a git/) });
  });

  it('reads a repository’s remotes from .git/config and persists the list in its userData', async () => {
    const repo = makeRepo('widgets');
    const first = await setup({ picked: repo });
    await first.invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await first.invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    const remotes = (await first.invoke(CHANNELS.remotesList, { repoId: added.id })) as { forge: { kind: string } | null }[];
    expect(remotes[0]?.forge).toMatchObject({ kind: 'gitlab', owner: 'team', repo: 'widgets' });

    const again = await setup();
    expect(((await again.invoke(CHANNELS.repoList)) as { id: string }[]).map((r) => r.id)).toEqual([added.id]);
  });

  async function vaultedGitlabAccount(cipher: ReturnType<typeof createFakeCipher>): Promise<ForgeAccount> {
    const account: ForgeAccount = {
      id: 'gitlab:gitlab.example.com:me',
      kind: 'gitlab',
      host: 'gitlab.example.com',
      login: 'me',
      displayName: 'Me',
      avatarUrl: null,
      email: null,
      addedAt: 0,
      hasToken: true,
      delegated: null,
    };
    mkdirSync(join(dir, 'userData'), { recursive: true });
    writeFileSync(join(dir, 'userData', 'forge-accounts.json'), JSON.stringify({ version: 1, accounts: [account], activeAccountId: account.id }));
    await createVaultService({ directory: join(dir, 'runtime'), cipher }).forApp('studio').set('forge-accounts', forgeAccountVaultKey('gitlab', 'gitlab.example.com', 'me'), TOKEN);
    return account;
  }

  it('is denied the forge token by default — nothing is sent, and the listing says why', async () => {
    const repo = makeRepo('widgets');
    const cipher = createFakeCipher();
    await vaultedGitlabAccount(cipher);
    const { invoke, requests } = await setup({ picked: repo });
    await invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    const pulls = await invoke(CHANNELS.forgePulls, { repoId: added.id, limit: 5, state: 'open', scope: 'all' });
    expect(pulls).toMatchObject({ cli: { reason: 'not-authenticated' }, pulls: [] });
    expect(requests).toEqual([]);
  });

  it('reads the token once Vault grants Coder forge accounts — it reaches the forge, never an answer', async () => {
    const repo = makeRepo('widgets');
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('coder', 'forge-accounts', '*')).toBe(true);
    const cipher = createFakeCipher();
    await vaultedGitlabAccount(cipher);
    const { invoke, requests } = await setup({ picked: repo });
    await invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    const pulls = await invoke(CHANNELS.forgePulls, { repoId: added.id, limit: 5, state: 'open', scope: 'all' });
    expect(requests.some((r) => r.authorization === TOKEN)).toBe(true);
    expect(JSON.stringify(pulls)).not.toContain(TOKEN);
    const accounts = await invoke(CHANNELS.forgeAccounts, {});
    expect(JSON.stringify(accounts)).not.toContain(TOKEN);
    expect(accounts).toMatchObject([{ hasToken: true }]);
  });

  it('refuses to store a token it holds no grant for, and registers no account', async () => {
    const deny: VaultAuthorize = (access) => access.appId !== 'coder';
    const { invoke } = await setup({ authorize: deny });
    const added = await invoke(CHANNELS.forgeAccountAdd, { kind: 'gitlab', host: 'gitlab.example.com', token: TOKEN });
    expect(added).toMatchObject({ ok: false, error: expect.stringMatching(/Vault/) });
    expect(JSON.stringify(added)).not.toContain(TOKEN);
    expect(await invoke(CHANNELS.forgeAccounts, {})).toEqual([]);
  });
});
