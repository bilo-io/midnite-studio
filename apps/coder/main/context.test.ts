// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain, a temp vault and temp repos.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClientManifest, type ScriptWorkerHandle } from '@midnite/studio-feature-api-client/main';
import { connectionFingerprint, databaseManifest } from '@midnite/studio-feature-database/main';
import { __resetForgeAccountsForTests, forgeManifest } from '@midnite/studio-feature-forge/main';
import { sessionsManifest } from '@midnite/studio-feature-sessions/main';
import { testsManifest } from '@midnite/studio-feature-tests/main';
import {
  createFakeCipher,
  createVaultGrants,
  startTestVaultHost,
  testPairingIdentity,
  writeRuntimeHostRecord,
  type PairingIdentity,
  type TestVaultHost,
  type VaultAuthorize,
} from '@midnite/studio-runtime';
import { CHANNELS, encodeAgentRunParam, forgeAccountVaultKey, handoffLink, type ForgeAccount } from '@midnite/studio-shared';

import { registerCoderHandlers } from './context';
import { CODER_GIT_CHANNELS } from './git';

/**
 * The database engine is faked: no database server (or container) starts here. What the test needs
 * from it is the password the feature's handlers hand `driverFor` / the pool — the one place a
 * credential leaves main's vault read, and where it must be exactly what the vault granted.
 */
const { passwordsSeen } = vi.hoisted(() => ({ passwordsSeen: [] as { id: string; password: string | undefined }[] }));
vi.mock('@midnite/studio-db-engine', () => {
  const driver = (id: string) => ({
    connect: async () => undefined,
    disconnect: async () => undefined,
    introspect: async () => ({ connectionId: id, tables: [] }),
    query: async () => ({ rowCount: 0 }),
  });
  return {
    driverFor: (config: { id: string }, password: string | undefined) => {
      passwordsSeen.push({ id: config.id, password });
      return driver(config.id);
    },
    createConnectionPool: () => ({
      get: async (config: { id: string }, password: string | undefined) => {
        passwordsSeen.push({ id: config.id, password });
        return driver(config.id);
      },
      touch: () => undefined,
      evict: async () => undefined,
      evictIdle: async () => undefined,
      evictAll: async () => undefined,
      size: () => 0,
    }),
  };
});

const TOKEN = 'glpat-CODER-VAULT-SECRET';
const DB_PASSWORD = 'pg-CODER-VAULT-PASSWORD';
/** Coder's own pairing key — each test's host is fresh, so it binds on the first connection. */
const PAIRING_KEY = testPairingIdentity();

let dir: string;
let host: TestVaultHost | null = null;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coder-main-'));
  mkdirSync(join(dir, 'runtime'));
  __resetForgeAccountsForTests();
  passwordsSeen.length = 0;
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
/** A script worker that is only a recording: nothing is forked, and a test can see it killed. */
class FakeWorker implements ScriptWorkerHandle {
  killed = false;
  posted: { runId: string }[] = [];
  private onMessage: ((message: unknown) => void) | null = null;
  postMessage = (message: unknown): void => {
    this.posted.push(message as { runId: string });
  };
  on(event: 'message' | 'exit', listener: ((message: unknown) => void) | ((code: number) => void)): void {
    if (event === 'message') this.onMessage = listener as (message: unknown) => void;
  }
  kill = (): void => {
    this.killed = true;
  };
  reply(): void {
    this.onMessage?.({ runId: this.posted[0]?.runId, run: { results: [], logs: [], mutations: { environment: {}, collectionVariables: {} }, error: null } });
  }
}

async function setup(
  options: { authorize?: VaultAuthorize; picked?: string | null; importFile?: string; pairing?: PairingIdentity; openExternal?: (url: string) => Promise<void> } = {},
) {
  await runtimeHost(options.authorize);
  const workers: FakeWorker[] = [];
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
  const { repos, shutdown } = registerCoderHandlers({
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
    dialogs: { pickFile: async () => options.importFile ?? null, pickSavePath: async () => null },
    scriptWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    ...(options.openExternal ? { openExternal: options.openExternal } : {}),
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)?.({}, payload);
  return { handlers, sends, invoke, requests, repos, shutdown, workers };
}

describe('registerCoderHandlers', () => {
  it('registers the forge, tests, API client, database and sessions features’ channels, its own repository list and the read-only git — and nothing else', async () => {
    const { handlers, sends } = await setup();
    const own = [
      CHANNELS.repoList,
      CHANNELS.repoPickDirectory,
      CHANNELS.repoOpen,
      CHANNELS.repoClose,
      CHANNELS.remotesList,
      CHANNELS.handoffOpen,
      CHANNELS.handoffRunReceiver,
      ...CODER_GIT_CHANNELS,
    ];
    expect([...handlers.keys()].sort()).toEqual(
      [...forgeManifest.ipc, ...testsManifest.ipc, ...apiClientManifest.ipc, ...databaseManifest.ipc, ...sessionsManifest.ipc, ...own].sort(),
    );
    expect([...sends.keys()].sort()).toEqual([...forgeManifest.sends, ...testsManifest.sends, ...sessionsManifest.sends].sort());
    for (const channel of [CHANNELS.secretsGet, CHANNELS.secretsSet, CHANNELS.secretsHas]) expect(handlers.has(channel)).toBe(false);
    // Coder starts no terminal session and ends none.
    for (const channel of [CHANNELS.ptyCreate, CHANNELS.ptyKill]) expect(handlers.has(channel) || sends.has(channel)).toBe(false);
  });

  it('names Studio as the run receiver only when the runtime host record says Studio hosts — names, never a path or pid', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.handoffRunReceiver)).toEqual({ receiver: null });
    const record = { version: 1 as const, pid: 4242, writtenAt: 1, broker: null };
    writeRuntimeHostRecord(join(dir, 'runtime'), { ...record, host: 'monitor' });
    expect(await invoke(CHANNELS.handoffRunReceiver)).toEqual({ receiver: null });
    writeRuntimeHostRecord(join(dir, 'runtime'), { ...record, host: 'studio' });
    expect(await invoke(CHANNELS.handoffRunReceiver)).toEqual({ receiver: 'studio' });
  });

  it('opens only a midnite://open link — the run link a card sends, never a URL the renderer names', async () => {
    const opened: string[] = [];
    const { invoke } = await setup({ openExternal: async (url) => void opened.push(url) });
    const run = { issueUrl: 'https://gitlab.example.com/team/widgets/issues/3', skill: '/midnite-create' };
    const link = handoffLink({ app: 'agents', run });
    expect(await invoke(CHANNELS.handoffOpen, { link })).toEqual({ ok: true });
    expect(opened).toEqual([`midnite://open?app=agents&run=${encodeAgentRunParam(run)}`]);
    for (const hostile of ['https://evil.example/x', 'file:///etc/passwd', 'midnite-studio://run?req=x', 'midnite://open?app=not-an-app']) {
      expect(await invoke(CHANNELS.handoffOpen, { link: hostile })).toEqual({ ok: false });
    }
    expect(opened).toHaveLength(1);
  });

  it('opens nothing when it was given no way to open a link', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.handoffOpen, { link: handoffLink({ app: 'agents' }) })).toEqual({ ok: false });
  });

  it('lists no sessions, plainly, when no runtime host has a broker running', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.terminalList)).toMatchObject({ sessions: [], broker: { mode: 'inproc' } });
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

/** A SQL connection — the engine is faked above, so nothing connects anywhere. */
const PG = { id: 'pg1', name: 'Local Postgres', provider: 'postgres', host: 'localhost', port: 5432, database: 'app', username: 'app' } as const;

describe('Coder’s Database tool: a password is read from the vault behind the grants, in main, and never answered', () => {
  /** Studio's side: the password stored under Studio's key for `PG`, fingerprinted as the feature does. */
  async function studioStoresPassword(): Promise<void> {
    await (await runtimeHost()).studio.set('db-credentials', PG.id, DB_PASSWORD, { fingerprint: connectionFingerprint({ ...PG }) });
  }

  it('is denied a database password by default — the connection opens with none', async () => {
    await studioStoresPassword();
    const { invoke } = await setup();
    await invoke(CHANNELS.dbSaveConnection, { connection: PG });

    await invoke(CHANNELS.dbGetSchema, { connectionId: PG.id });

    expect(passwordsSeen).toEqual([{ id: PG.id, password: undefined }]);
  });

  it('reads the password once Vault grants Coder db-credentials — it reaches the driver and nothing else', async () => {
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('coder', 'db-credentials', '*')).toBe(true);
    await studioStoresPassword();
    const { invoke } = await setup();
    await invoke(CHANNELS.dbSaveConnection, { connection: PG });

    const schema = await invoke(CHANNELS.dbGetSchema, { connectionId: PG.id });
    const list = await invoke(CHANNELS.dbListConnections);

    expect(passwordsSeen).toEqual([{ id: PG.id, password: DB_PASSWORD }]);
    expect(JSON.stringify(schema)).not.toContain(DB_PASSWORD);
    expect(JSON.stringify(list)).not.toContain(DB_PASSWORD);
    expect(list).toMatchObject([{ id: PG.id, name: 'Local Postgres' }]);
  });

  it('refuses to store a password it holds no grant for: a sentence, the connection saved, no value anywhere', async () => {
    const deny: VaultAuthorize = (access) => access.appId !== 'coder';
    const { invoke } = await setup({ authorize: deny });

    const saved = await invoke(CHANNELS.dbSaveConnection, { connection: PG, password: DB_PASSWORD });

    expect(saved).toMatchObject({ ok: false, message: expect.stringMatching(/password could not be stored/) });
    expect(JSON.stringify(saved)).not.toContain(DB_PASSWORD);
    expect(await (await runtimeHost()).studio.get('db-credentials', PG.id)).toBeNull();
    expect(await invoke(CHANNELS.dbListConnections)).toMatchObject([{ id: PG.id }]);
  });

  it('stores a granted password in the host’s vault — Studio reads it, the answer does not carry it', async () => {
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('coder', 'db-credentials', '*')).toBe(true);
    const { invoke } = await setup();

    const saved = await invoke(CHANNELS.dbSaveConnection, { connection: PG, password: DB_PASSWORD });

    expect(saved).toMatchObject({ ok: true });
    expect(JSON.stringify(saved)).not.toContain(DB_PASSWORD);
    expect(await (await runtimeHost()).studio.get('db-credentials', PG.id)).toBe(DB_PASSWORD);
    // Connections persist in Coder's own userData; the password is in no file there.
    const stored = readFileSync(join(dir, 'userData', 'db-connections.json'), 'utf8');
    expect(stored).toContain('Local Postgres');
    expect(stored).not.toContain(DB_PASSWORD);
  });
});

describe('Coder’s API client: collections are confined to a checkout Coder holds, and the script worker is killed on quit', () => {
  /** A repository Coder admitted through its dialog, and its id. */
  async function openRepo(invoke: (channel: string, payload?: unknown) => unknown, repo: string): Promise<string> {
    await invoke(CHANNELS.repoPickDirectory);
    const { repo: added } = (await invoke(CHANNELS.repoOpen, { path: repo })) as { repo: { id: string } };
    return added.id;
  }

  const COLLECTION = 'api.postman_collection.json';
  const scriptRequest = (repoId: string, collectionId: string) => ({
    repoId,
    collectionId,
    source: "pm.test('x', () => {})",
    environmentId: null,
    collectionVariables: [],
    request: { method: 'GET', url: 'http://x', headers: {} },
    response: null,
  });

  /** A Postman collection on disk outside any checkout — what the user picks in the import dialog. */
  function collectionFile(name: string): string {
    const file = join(dir, COLLECTION);
    writeFileSync(file, JSON.stringify({ info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [] }));
    return file;
  }

  it('refuses a repository id Coder’s list does not hold, and writes nothing', async () => {
    const { invoke } = await setup({ importFile: collectionFile('x') });
    expect(await invoke(CHANNELS.apiImportCollection, { repoId: 'repo:/etc' })).toMatchObject({ ok: false });
    expect(await invoke(CHANNELS.apiListCollections, { repoId: 'repo:/etc' })).toMatchObject({ ok: false });
  });

  it('keeps collections under .midnite/api/ in the checkout, and lists them back', async () => {
    const repo = makeRepo('widgets');
    const { invoke } = await setup({ picked: repo, importFile: collectionFile('Widgets API') });
    const repoId = await openRepo(invoke, repo);

    const imported = (await invoke(CHANNELS.apiImportCollection, { repoId })) as { ok: true; value: { id: string } };
    expect(imported).toMatchObject({ ok: true });

    // Import names the file from the collection (not the picked file), inside the checkout's `.midnite/api/`.
    expect(readFileSync(join(repo, '.midnite', 'api', 'collections', imported.value.id), 'utf8')).toContain('Widgets API');
    expect(await invoke(CHANNELS.apiListCollections, { repoId })).toMatchObject({ ok: true, value: [{ id: imported.value.id }] });
  });

  it('runs no script until the collection is trusted — the worker is not even forked', async () => {
    const repo = makeRepo('widgets');
    const { invoke, workers } = await setup({ picked: repo, importFile: collectionFile('x') });
    const repoId = await openRepo(invoke, repo);
    const imported = (await invoke(CHANNELS.apiImportCollection, { repoId })) as { value: { id: string } };

    const outcome = await invoke(CHANNELS.apiRunScript, scriptRequest(repoId, imported.value.id));

    expect(outcome).toEqual({ ok: true, value: { status: 'needs-consent' } });
    expect(workers).toHaveLength(0);
  });

  it('runs a trusted script in the forked worker, and kills that worker on quit', async () => {
    const repo = makeRepo('widgets');
    const { invoke, workers, shutdown } = await setup({ picked: repo, importFile: collectionFile('x') });
    const repoId = await openRepo(invoke, repo);
    const imported = (await invoke(CHANNELS.apiImportCollection, { repoId })) as { value: { id: string } };
    const collectionId = imported.value.id;
    expect(await invoke(CHANNELS.apiSetScriptTrust, { repoId, collectionId, trusted: true })).toMatchObject({ ok: true });

    const pending = invoke(CHANNELS.apiRunScript, scriptRequest(repoId, collectionId)) as Promise<unknown>;
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    await vi.waitFor(() => expect(workers[0]?.posted).toHaveLength(1));
    workers[0]?.reply();
    expect(await pending).toMatchObject({ ok: true, value: { status: 'ran' } });
    expect(workers[0]?.killed).toBe(false);

    await shutdown();

    expect(workers[0]?.killed).toBe(true);
  });
});
