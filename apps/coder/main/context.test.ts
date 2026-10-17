// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain, a temp vault and temp repos.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetForgeAccountsForTests, forgeManifest } from '@midnite/studio-feature-forge/main';
import { testsManifest } from '@midnite/studio-feature-tests/main';
import { createFakeCipher, createVaultGrants, startTestVaultHost, testPairingIdentity, type PairingIdentity, type TestVaultHost, type VaultAuthorize } from '@midnite/studio-runtime';
import { CHANNELS, forgeAccountVaultKey, type ForgeAccount } from '@midnite/studio-shared';

import { registerCoderHandlers } from './context';
import { CODER_GIT_CHANNELS } from './git';

const TOKEN = 'glpat-CODER-VAULT-SECRET';
/** Coder's own pairing key — each test's host is fresh, so it binds on the first connection. */
const PAIRING_KEY = testPairingIdentity();

let dir: string;
let host: TestVaultHost | null = null;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coder-main-'));
  mkdirSync(join(dir, 'runtime'));
  __resetForgeAccountsForTests();
});
afterEach(async () => {
  await host?.close();
  host = null;
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** Studio's side: the runtime host over the temp runtime directory, with its own (fake) cipher. */
async function runtimeHost(authorize?: VaultAuthorize): Promise<TestVaultHost> {
  host ??= await startTestVaultHost({
    runtimeDirectory: join(dir, 'runtime'),
    cipher: createFakeCipher(),
    ...(authorize ? { authorize } : {}),
  });
  return host;
}

/** A checkout whose `.git/config` names a GitLab origin — read as a file, never by running git. */
function makeRepo(name: string): string {
  const repo = join(dir, name);
  mkdirSync(join(repo, '.git'), { recursive: true });
  writeFileSync(join(repo, '.git', 'config'), '[remote "origin"]\n\turl = https://gitlab.example.com/team/widgets.git\n');
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return realpathSync(repo);
}

/** Registers Coder over a temp vault and userData; every outbound request lands on the injected fetch. */
async function setup(options: { authorize?: VaultAuthorize; picked?: string | null; pairing?: PairingIdentity } = {}) {
  await runtimeHost(options.authorize);
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
    // This app's pairing key, as its own pairing.ts would keep it — a random seed, no keychain.
    pairing: () => options.pairing ?? PAIRING_KEY,
    pickDirectory: async () => options.picked ?? null,
    senderWindowId: () => 1,
    onWindowClosed: () => undefined,
    windows: { anyWindowVisible: () => false, idleState: () => 'active' },
    fetch,
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)?.({}, payload);
  return { handlers, sends, invoke, requests, repos };
}

describe('registerCoderHandlers', () => {
  it('registers the forge and tests features’ channels, its own repository list and the read-only git — and nothing else', async () => {
    const { handlers, sends } = await setup();
    const own = [CHANNELS.repoList, CHANNELS.repoPickDirectory, CHANNELS.repoOpen, CHANNELS.repoClose, CHANNELS.remotesList, ...CODER_GIT_CHANNELS];
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

  async function vaultedGitlabAccount(): Promise<ForgeAccount> {
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
    // Stored by Studio, under Studio's key — the one login Coder is about to see.
    await (await runtimeHost()).studio.set('forge-accounts', forgeAccountVaultKey('gitlab', 'gitlab.example.com', 'me'), TOKEN);
    return account;
  }

  it('is denied the forge token by default — nothing is sent, and the listing says why', async () => {
    const repo = makeRepo('widgets');
    await vaultedGitlabAccount();
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
    await vaultedGitlabAccount();
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

  it('one login: an account Studio stored — no record in Coder at all — is listed and used once granted', async () => {
    const repo = makeRepo('widgets');
    const studio = (await runtimeHost()).studio;
    await studio.set('forge-accounts', forgeAccountVaultKey('gitlab', 'gitlab.example.com', 'me'), TOKEN);

    // Not granted: Coder sees no account and sends nothing authenticated.
    const denied = await setup({ picked: repo });
    expect(await denied.invoke(CHANNELS.forgeAccounts, {})).toEqual([]);

    __resetForgeAccountsForTests();
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('coder', 'forge-accounts', '*')).toBe(true);
    const { invoke, requests } = await setup({ picked: repo });
    const accounts = await invoke(CHANNELS.forgeAccounts, {});
    expect(accounts).toMatchObject([{ id: 'gitlab:gitlab.example.com:me', hasToken: true }]);
    expect(JSON.stringify(accounts)).not.toContain(TOKEN);
    await invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    await invoke(CHANNELS.forgePulls, { repoId: added.id, limit: 5, state: 'open', scope: 'all' });
    expect(requests.some((r) => r.authorization === TOKEN)).toBe(true);
  });

  it('granted but not paired as Coder (another key under its name): no token, nothing sent with one', async () => {
    const repo = makeRepo('widgets');
    await vaultedGitlabAccount();
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('coder', 'forge-accounts', '*')).toBe(true);
    // The real Coder paired first…
    const real = await setup({ picked: repo });
    expect(await real.invoke(CHANNELS.forgeAccounts, {})).toMatchObject([{ hasToken: true }]);
    // …so a process that claims "coder" with any other key is refused, grant or no grant.
    __resetForgeAccountsForTests();
    const { invoke, requests } = await setup({ picked: repo, pairing: testPairingIdentity() });
    await invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    await invoke(CHANNELS.forgePulls, { repoId: added.id, limit: 5, state: 'open', scope: 'all' });
    expect(requests.some((r) => r.authorization === TOKEN)).toBe(false);
  });

  it('with no runtime host running, says the vault is Studio’s instead of storing anything', async () => {
    const { invoke } = await setup();
    // Studio quits: its socket goes with it.
    await host?.close();
    host = null;
    const added = await invoke(CHANNELS.forgeAccountAdd, { kind: 'gitlab', host: 'gitlab.example.com', token: TOKEN });
    expect(added).toMatchObject({ ok: false, error: expect.stringMatching(/Open Studio/) });
    expect(await invoke(CHANNELS.forgeAccounts, {})).toEqual([]);
  });
});
