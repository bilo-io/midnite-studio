import { homedir } from 'node:os';

import { chatsMain, createChatsRuntime, type ChatsRuntimeDeps } from '@midnite/studio-feature-chats/main';
import {
  configureCouncils,
  councilsMain,
  createCouncilsRunsStore,
  createCouncilsStore,
} from '@midnite/studio-feature-councils/main';
import {
  configureOllamaSettings,
  createOllamaSettingsStore,
  getConfiguredOllamaHost,
  modelsMain,
  ollamaChatStream,
  resolveOllamaBaseUrl,
} from '@midnite/studio-feature-models/main';
import {
  createIpcContext,
  createVaultGrants,
  createVaultService,
  type IpcContextElectron,
  type VaultAuthorize,
  type VaultCipher,
} from '@midnite/studio-runtime';
import { BUILTIN_AGENTS, CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

import { createShellRunner } from './shell-runner';

/** The one secret Agents reads, and nothing else: the Ollama cloud key (the `secrets` namespace). */
const OLLAMA_KEY = 'ollama.apiKey';

/** The electron pieces Agents' main needs, injected so registration is testable under bare vitest. */
export type AgentsElectron = IpcContextElectron & {
  /** Agents' own userData: chats, councils and the Ollama settings live under it. */
  userData: string;
  /** The runtime's data directory, where the vault's namespace files live. */
  vaultDirectory: string;
  /** `safeStorage` in the app, a fake in tests — never the real keychain under test. */
  cipher: VaultCipher;
  /**
   * Who may read what. Absent, the grants file the Vault app edits decides — so Agents is denied the
   * Ollama key until the user grants it, never handed it by the runtime's allow-all default.
   */
  authorize?: VaultAuthorize;
  /** The shell a council member runs in; the user's login shell by default. */
  shell?: string;
};

/**
 * Registers every channel Agents' renderer can call: the models, councils and chats features', the
 * agent roster, and `secretsHas` narrowed to the Ollama key. **The key is read here, from the runtime
 * vault as `agents`, and answers no channel** — when the vault refuses Agents (no grant) the cloud
 * catalogue is fetched unauthenticated and a cloud-bound council member runs without a token, and the
 * renderer's `has` answers false. No chat engine reads a key: each agent CLI brings its own login.
 */
export function registerAgentsHandlers(el: AgentsElectron): { dispose(): void } {
  const vault = createVaultService({
    directory: el.vaultDirectory,
    cipher: el.cipher,
    authorize: el.authorize ?? createVaultGrants({ directory: el.vaultDirectory }).authorize,
  }).forApp('agents');
  const ollamaKey = (): Promise<string | null> => vault.get('secrets', OLLAMA_KEY);
  const ctx = createIpcContext(el);

  // Models — the Ollama client, pull queue and the persisted host override.
  configureOllamaSettings(createOllamaSettingsStore(el.userData));
  modelsMain.register(ctx, { cloudApiKey: ollamaKey });

  // Chats — agent CLIs and the local daemon. No repository registry yet, so every chat runs in its
  // scratch directory; the roster is the builtins (the probe and `agents.json` stay Studio's).
  const deps: ChatsRuntimeDeps = {
    agents: async () => [...BUILTIN_AGENTS],
    resolveRepo: () => null,
    emit: (event) => el.send(EVENT_CHANNELS.chatsEvent, event),
    ollamaStream: async (req) =>
      ollamaChatStream(
        { model: req.model, messages: req.messages },
        {
          baseUrl: (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl(),
          signal: req.signal,
          onDelta: req.onDelta,
          ...(req.onThinking ? { onThinking: req.onThinking } : {}),
          ...(req.onUsage ? { onUsage: req.onUsage } : {}),
          timeoutMs: 15_000,
        },
      ),
  };
  const runtime = createChatsRuntime(el.userData, deps);
  chatsMain.register(ctx, { runtime: () => runtime, repoPath: () => null, home: homedir });

  // Councils — members run as piped login shells (see shell-runner.ts).
  configureCouncils(createCouncilsStore(el.userData), createCouncilsRunsStore(el.userData));
  const shellRunner = createShellRunner(el.shell === undefined ? {} : { shell: el.shell });
  councilsMain.register(ctx, {
    runner: {
      ...shellRunner,
      listAgents: async () => [...BUILTIN_AGENTS],
      agentBinding: () => undefined,
      ollamaBaseUrl: () => resolveOllamaBaseUrl(),
      ollamaApiKey: ollamaKey,
    },
  });

  // The roster, as the renderer's `useAgents` asks for it. Install status is unknown here (no probe),
  // which the renderer reads as "assume it works" — a missing CLI surfaces as the turn's own error.
  el.ipcMain.handle(CHANNELS.agentList, () => ({ agents: [...BUILTIN_AGENTS], status: [], probe: 'unknown' as const }));

  el.ipcMain.handle(CHANNELS.secretsHas, async (_event, raw: unknown) => {
    const parsed = schemas.SecretsHasRequest.safeParse(raw);
    // Only the Ollama key is Agents' to ask about; any other answers "not set".
    if (!parsed.success || parsed.data.key !== OLLAMA_KEY) return { hasKey: false };
    return { hasKey: await vault.has('secrets', OLLAMA_KEY) };
  });

  return { dispose: () => shellRunner.killAll() };
}
