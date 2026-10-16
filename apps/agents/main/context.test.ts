// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain and a temp vault.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatsManifest } from '@midnite/studio-feature-chats/main';
import { councilsManifest, resetCouncilsForTest } from '@midnite/studio-feature-councils/main';
import { modelsManifest, resetOllamaSettingsState } from '@midnite/studio-feature-models/main';
import { createFakeCipher, createVaultGrants, createVaultService, type VaultAuthorize } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerAgentsHandlers } from './context';

const KEY = 'ollama.apiKey';
const SECRET = 'OLLAMA-VAULT-SECRET';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agents-main-'));
  mkdirSync(join(dir, 'runtime'));
  resetCouncilsForTest();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetOllamaSettingsState();
  vi.unstubAllGlobals();
});

/** Registers Agents over a temp vault holding the key; every outbound request lands on the stub. */
async function setup(authorize?: VaultAuthorize) {
  const cipher = createFakeCipher();
  await createVaultService({ directory: join(dir, 'runtime'), cipher }).forApp('studio').set('secrets', KEY, SECRET);
  const requests: { url: string; authorization: string | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      requests.push({ url: String(url), authorization: init?.headers?.['authorization'] });
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }),
  );
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  registerAgentsHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: () => undefined },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: join(dir, 'userData'),
    vaultDirectory: join(dir, 'runtime'),
    cipher,
    ...(authorize ? { authorize } : {}),
  });
  return { handlers, requests };
}

describe('registerAgentsHandlers', () => {
  it('registers the three features’ channels, the roster and secretsHas — and nothing else', async () => {
    const { handlers } = await setup();
    const expected = [...modelsManifest.ipc, ...councilsManifest.ipc, ...chatsManifest.ipc, CHANNELS.agentList, CHANNELS.secretsHas];
    expect([...handlers.keys()].sort()).toEqual(expected.sort());
    expect(handlers.has(CHANNELS.secretsGet)).toBe(false);
    expect(handlers.has(CHANNELS.secretsSet)).toBe(false);
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
});
