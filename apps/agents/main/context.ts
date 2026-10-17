import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

import { chatsMain, createChatsRuntime, type ChatsRuntimeDeps } from '@midnite/studio-feature-chats/main';
import {
  configureCouncils,
  councilsMain,
  createCouncilsRunsStore,
  createCouncilsStore,
} from '@midnite/studio-feature-councils/main';
import { createNoMcpServer, mcpToolsMain } from '@midnite/studio-feature-mcp-tools/main';
import {
  configureOllamaSettings,
  createOllamaSettingsStore,
  getConfiguredOllamaHost,
  modelsMain,
  ollamaChatStream,
  resolveOllamaBaseUrl,
  runOllamaPrompt,
} from '@midnite/studio-feature-models/main';
import {
  disposeWorkflows,
  silentWorkflowLogger,
  workflowsMain,
  type WorkflowLogger,
} from '@midnite/studio-feature-workflows/main';
import {
  connectRuntimeVault,
  createIpcContext,
  createSharedBroker,
  vaultHostSocketPath,
  type IpcContextElectron,
  type PairingIdentity,
} from '@midnite/studio-runtime';
import { BUILTIN_AGENTS, CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

import { createBrokerNodeSessions } from './broker-sessions';
import { createShellRunner } from './shell-runner';

/** The one secret Agents reads, and nothing else: the Ollama cloud key (the `secrets` namespace). */
const OLLAMA_KEY = 'ollama.apiKey';

/** The electron pieces Agents' main needs, injected so registration is testable under bare vitest. */
export type AgentsElectron = IpcContextElectron & {
  /** Agents' own userData: chats, councils and the Ollama settings live under it. */
  userData: string;
  /**
   * The runtime's data directory, where the runtime host (Studio) serves the vault on a socket.
   * Agents holds no cipher: the host decrypts, and the host's grants decide — so Agents is denied the
   * Ollama key until the user grants it in Vault (docs/APPS.md, "The shared data plane").
   */
  vaultDirectory: string;
  /** Agents' pairing key (`pairing.ts`): the host serves nothing to a connection that has not proved it. */
  pairing: () => PairingIdentity | null;
  /** The shell a council member or script node runs in; the user's login shell by default. */
  shell?: string;
  /** Where the workflow engine logs. Silent by default. */
  log?: WorkflowLogger;
};

/**
 * Registers every channel Agents' renderer can call: the models, councils, chats, workflows and MCP
 * tools features', the agent roster, and `secretsHas` narrowed to the Ollama key. **The key is read here, from the runtime
 * vault as `agents`, and answers no channel** — when the vault refuses Agents (no grant) the cloud
 * catalogue is fetched unauthenticated and a cloud-bound council member runs without a token, and the
 * renderer's `has` answers false. No chat engine reads a key: each agent CLI brings its own login.
 */
export function registerAgentsHandlers(el: AgentsElectron): { dispose(): Promise<void> } {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'agents', identity: el.pairing });
  const ollamaKey = (): Promise<string | null> => vault.get('secrets', OLLAMA_KEY);
  // The stores write straight into `userData` and treat a missing directory as read-only; Electron creates it lazily.
  mkdirSync(el.userData, { recursive: true });
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

  // Workflows — the graph engine over Agents' ports: the builtin roster, the Ollama daemon and key, a
  // piped login shell for script nodes (node-session.ts), and agent nodes on the runtime host's shared
  // broker as a guest, when one is running (broker-sessions.ts) — they fail plainly when none is. No
  // repository registry or forge, so git, forge and gate-comment steps report their own failure.
  const nodeSessions = createBrokerNodeSessions({
    broker: createSharedBroker({ runtimeDirectory: el.vaultDirectory, appId: 'agents' }),
    shell: shellRunner,
    agents: () => BUILTIN_AGENTS,
  });
  workflowsMain.register(ctx, {
    dataDirectory: el.userData,
    ports: {
      log: el.log ?? silentWorkflowLogger,
      listAgents: async () => [...BUILTIN_AGENTS],
      agentBinding: () => undefined,
      ollamaBaseUrl: () => resolveOllamaBaseUrl(),
      ollamaApiKey: ollamaKey,
      ollamaPrompt: (model, prompt, timeoutMs) => runOllamaPrompt(model, prompt, timeoutMs),
      pty: nodeSessions.ports,
    },
  });

  // MCP tools — the Tools tab. The `midnite` server is Studio's, so this one reports itself as off.
  mcpToolsMain.register(ctx, { server: createNoMcpServer('Midnite Agents does not run the MCP server — Midnite Studio does.') });

  // The roster, as the renderer's `useAgents` asks for it. Install status is unknown here (no probe),
  // which the renderer reads as "assume it works" — a missing CLI surfaces as the turn's own error.
  el.ipcMain.handle(CHANNELS.agentList, () => ({ agents: [...BUILTIN_AGENTS], status: [], probe: 'unknown' as const }));

  el.ipcMain.handle(CHANNELS.secretsHas, async (_event, raw: unknown) => {
    const parsed = schemas.SecretsHasRequest.safeParse(raw);
    // Only the Ollama key is Agents' to ask about; any other answers "not set".
    if (!parsed.success || parsed.data.key !== OLLAMA_KEY) return { hasKey: false };
    return { hasKey: await vault.has('secrets', OLLAMA_KEY) };
  });

  return {
    // A council member's or script node's shell is its own process group and would outlive Agents; an
    // in-flight run is cancelled so its node's process group dies with it, and the demo API closes.
    // Agent nodes' sessions on the shared broker are Agents' own: they are killed here too (and only
    // they — the guest detaches without touching anyone else's session).
    dispose: async () => {
      shellRunner.killAll();
      await disposeWorkflows();
      await nodeSessions.dispose();
      vault.close();
    },
  };
}
