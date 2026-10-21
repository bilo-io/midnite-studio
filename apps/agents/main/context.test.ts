// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain and a temp vault.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatsManifest } from '@midnite/studio-feature-chats/main';
import { mcpToolsManifest } from '@midnite/studio-feature-mcp-tools/main';
import { councilsManifest, resetCouncilsForTest } from '@midnite/studio-feature-councils/main';
import { modelsManifest, resetOllamaSettingsState } from '@midnite/studio-feature-models/main';
import { workflowsManifest } from '@midnite/studio-feature-workflows/main';
import { reportManifest } from '@midnite/studio-feature-report/main';
import { createFakeCipher, createVaultGrants, startTestVaultHost, testPairingIdentity, type VaultAuthorize } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerAgentsHandlers } from './context';

const KEY = 'ollama.apiKey';
const SECRET = 'OLLAMA-VAULT-SECRET';
/** Agents' own pairing key — each test's host is fresh, so it binds on the first connection. */
const PAIRING_KEY = testPairingIdentity();

let dir: string;
const disposers: (() => Promise<void>)[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agents-main-'));
  mkdirSync(join(dir, 'runtime'));
  resetCouncilsForTest();
});
afterEach(async () => {
  // Stops the demo API and any in-flight run, and kills the shells a script node started.
  for (const dispose of disposers.splice(0)) await dispose();
  rmSync(dir, { recursive: true, force: true });
  resetOllamaSettingsState();
  vi.unstubAllGlobals();
});

/** Registers Agents over a temp vault holding the key; every outbound request lands on the stub. */
async function setup(authorize?: VaultAuthorize, loginPath: () => Promise<void> = async () => undefined) {
  // Studio's side: the runtime host, holding the key under its own (fake) cipher. Agents holds none.
  const host = await startTestVaultHost({
    runtimeDirectory: join(dir, 'runtime'),
    cipher: createFakeCipher(),
    ...(authorize ? { authorize } : {}),
  });
  await host.studio.set('secrets', KEY, SECRET);
  const requests: { url: string; authorization: string | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      requests.push({ url: String(url), authorization: init?.headers?.['authorization'] });
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }),
  );
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const registered = registerAgentsHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void handlers.set(c, (_e, raw) => l(_e, raw)) },
    report: { sink: () => null, homeDir: () => '/home', openExternal: () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: join(dir, 'userData'),
    vaultDirectory: join(dir, 'runtime'),
    // This app's pairing key, as its own pairing.ts would keep it — a random seed, no keychain.
    pairing: () => PAIRING_KEY,
    // A real shell, so a script node really runs — under a temp dir, never the user's home.
    shell: '/bin/sh',
    // Never the real login-shell probe: it would source the user's rc files and rewrite this process's PATH.
    loginPath,
  });
  disposers.push(registered.dispose, () => host.close());
  return { handlers, requests };
}

describe('registerAgentsHandlers', () => {
  it('registers the five features’ channels, the roster and secretsHas — and nothing else', async () => {
    const { handlers } = await setup();
    const expected = [
      ...modelsManifest.ipc,
      ...councilsManifest.ipc,
      ...chatsManifest.ipc,
      ...workflowsManifest.ipc,
      ...mcpToolsManifest.ipc,
      ...reportManifest.ipc,
      ...reportManifest.sends,
      CHANNELS.agentList,
      CHANNELS.secretsHas,
    ];
    expect([...handlers.keys()].sort()).toEqual(expected.sort());
    expect(handlers.has(CHANNELS.secretsGet)).toBe(false);
    expect(handlers.has(CHANNELS.secretsSet)).toBe(false);
  });

  it('starts the login-shell PATH probe once, at registration', async () => {
    // A launcher-started Agents has launchd's bare PATH; without this a chat's `claude` spawn is ENOENT.
    const loginPath = vi.fn(async () => undefined);
    await setup(undefined, loginPath);
    expect(loginPath).toHaveBeenCalledTimes(1);
  });

  it('answers the roster as the builtins, with install status unknown', async () => {
    const { handlers } = await setup();
    const roster = (await handlers.get(CHANNELS.agentList)?.({}, undefined)) as { agents: { id: string }[]; status: unknown[]; probe: string };
    expect(roster.agents.map((a) => a.id)).toContain('claude');
    expect(roster).toMatchObject({ status: [], probe: 'unknown' });
  });

  it('is denied the key by default — no grant, no key, and the cloud catalogue is asked unauthenticated', async () => {
    const { handlers, requests } = await setup();
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: false });
    await handlers.get(CHANNELS.ollamaCloudList)?.({}, undefined);
    expect(requests[0]?.url).toContain('ollama.com/api/tags');
    expect(requests[0]?.authorization).toBeUndefined();
  });

  it('reads the key once the user grants Agents the secrets namespace in Vault', async () => {
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('agents', 'secrets', [KEY])).toBe(true);
    const { handlers } = await setup();
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: true });
  });

  it('reads the Ollama key from the vault as agents, sends it to ollama.com, and no answer contains it', async () => {
    const { handlers, requests } = await setup(() => true);
    const catalogue = await handlers.get(CHANNELS.ollamaCloudList)?.({}, undefined);
    expect(requests[0]?.authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(catalogue)).not.toContain(SECRET);
    const has = await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY });
    expect(has).toEqual({ hasKey: true });
    expect(JSON.stringify(has)).not.toContain(SECRET);
  });

  it('answers a missing key when the vault refuses agents specifically', async () => {
    const deny: VaultAuthorize = (access) => access.appId !== 'agents';
    const { handlers, requests } = await setup(deny);
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: false });
    await handlers.get(CHANNELS.ollamaCloudList)?.({}, undefined);
    expect(requests[0]?.authorization).toBeUndefined();
  });

  it('answers secretsHas false for any other secret', async () => {
    const { handlers } = await setup(() => true);
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: 'finance.twelveData' })).toEqual({ hasKey: false });
  });

  it('creates a council and a chat over the wire, in its own userData', async () => {
    const { handlers } = await setup();
    expect(await handlers.get(CHANNELS.councilCreate)?.({}, { name: 'Review board' })).toMatchObject({ ok: true });
    expect(await handlers.get(CHANNELS.chatsCreate)?.({}, { engine: 'claude' })).toMatchObject({ ok: true });
    const listed = (await handlers.get(CHANNELS.chatsList)?.({}, undefined)) as { chats: unknown[] };
    expect(listed.chats).toHaveLength(1);
  });

  describe('workflows', () => {
    const graph = (id: string, nodes: unknown[]) => ({ id, name: `Graph ${id}`, nodes, edges: [], createdAt: 1, updatedAt: 1 });
    const script = (command: string) => ({
      id: 'n1',
      kind: 'script',
      label: 'Say hi',
      x: 0,
      y: 0,
      config: { command, cwd: tmpdir(), env: {} },
    });

    type RunView = { status: string; nodes: { status: string; error?: string; output?: unknown }[] };

    async function runToEnd(handlers: Map<string, (event: unknown, raw: unknown) => unknown>, workflowId: string): Promise<RunView> {
      const started = (await handlers.get(CHANNELS.workflowRun)?.({}, { workflowId })) as { ok: boolean };
      expect(started).toMatchObject({ ok: true });
      return vi.waitFor(async () => {
        const { runs } = (await handlers.get(CHANNELS.workflowRunsList)?.({}, { workflowId })) as { runs: RunView[] };
        const run = runs[0];
        expect(run).toBeDefined();
        expect(run?.status).not.toBe('running');
        return run as RunView;
      });
    }

    it('runs a script node in a piped login shell and captures its output', async () => {
      const { handlers } = await setup();
      await handlers.get(CHANNELS.workflowSave)?.({}, { workflow: graph('w1', [script('echo hello-from-agents')]) });
      const run = await runToEnd(handlers, 'w1');
      expect(run.status).toBe('completed');
      expect(JSON.stringify(run.nodes[0]?.output)).toContain('hello-from-agents');
    });

    it('fails an agent node with a plain message instead of hanging when no host broker is running', async () => {
      const { handlers } = await setup();
      const agent = { id: 'n1', kind: 'agent', label: 'Ask', x: 0, y: 0, config: { agentId: 'claude', prompt: 'hi' } };
      await handlers.get(CHANNELS.workflowSave)?.({}, { workflow: graph('w2', [agent]) });
      const run = await runToEnd(handlers, 'w2');
      expect(run.status).toBe('failed');
      expect(JSON.stringify(run)).toContain('need a terminal session');
    });

    it('fails a git or forge step on its own, with no repository registry to read', async () => {
      const { handlers } = await setup();
      const git = { id: 'n1', kind: 'git-status', label: 'Status', x: 0, y: 0, config: { repoId: 'r1' } };
      await handlers.get(CHANNELS.workflowSave)?.({}, { workflow: graph('w3', [git]) });
      const run = await runToEnd(handlers, 'w3');
      expect(run.status).toBe('failed');
    });

    it('stores its graphs under its own userData', async () => {
      const { handlers } = await setup();
      await handlers.get(CHANNELS.workflowSave)?.({}, { workflow: graph('w4', [script('true')]) });
      expect(readdirSync(join(dir, 'userData'))).toContain('workflows.json');
    });
  });

  it('answers the MCP tools channels as a server that is not running, and refuses to start one', async () => {
    const { handlers } = await setup();
    expect(await handlers.get(CHANNELS.mcpGet)?.({}, undefined)).toMatchObject({ enabled: false, running: false, shimPath: null });
    expect(await handlers.get(CHANNELS.mcpSet)?.({}, { enabled: true })).toMatchObject({ enabled: false, error: expect.stringContaining('Midnite Studio') });
    expect(await handlers.get(CHANNELS.mcpCalls)?.({}, undefined)).toEqual({ calls: [] });
  });
});
