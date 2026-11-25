import { homedir } from 'node:os';
import { basename } from 'node:path';

import {
  chatsMain,
  createChatsRuntime,
  type ChatsRuntime,
  type ChatsRuntimeDeps,
} from '@midnite/studio-feature-chats/main';
import { getConfiguredOllamaHost, ollamaChatStream, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import { engineKeyEnv, type FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { agentProfilePromptPath, getAgentProfile } from '@midnite/studio-feature-agent-profiles/main';

import { recordAudit } from '../agent-audit';
import { studioHeadlessRuns } from '../agent-profiles/headless-run-profiles';
import { createProfileHeadlessRun } from '../agent-profiles/profile-headless';
import { studioProfileMcpSockets } from '../agent-profiles/studio-profile-sockets';
import { agentHistoryReadsEnabled } from '../settings-mirror';
import { mcpServersHeldForRun } from '../mcp-trust-wiring';
import { outboundSecrets } from '../outbound-secrets';
import { readAgentApiKey } from './secrets-handlers';
import { getRepo } from '../repo-registry';
import { listAgents } from '../terminal-service';
import { getUnifiedSessionCoordinator } from '../unified-session-host';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';

/**
 * The Chats page's IPC surface is the chats feature's main half (Phase 113
 * Theme N); this is Studio's composition of it. The feature owns the store,
 * the engines and the turn service; this file hands it what only Studio has —
 * the agent roster, the open repositories, the broadcast to every window and
 * the Ollama stream (the models feature's client, joined here rather than
 * imported by chats).
 *
 * The one key a turn's engine needs (`agent.<id>.apiKey`, Phase 121 Theme I) is read here, in main, at
 * spawn, and goes into that child's environment alone; the Ollama stream is the local daemon and gets none.
 *
 * Injected at boot with a store rooted at `app.getPath('userData')`, like
 * `configureNotes`; until then the service runs on an in-memory store.
 */
/** Where a chat's refusal sends the user: the composer's agent picker. */
export const CHATS_PICK_HINT = 'Pick another agent for this chat.';

const deps: ChatsRuntimeDeps = {
  agents: listAgents,
  resolveRepo: (repoId) => {
    const entry = getRepo(repoId);
    return entry ? { id: entry.id, path: entry.path, name: basename(entry.path) } : null;
  },
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.chatsEvent, event),
  audit: recordAudit,
  engineEnv: async (agentId) => engineKeyEnv((await listAgents()).find((a) => a.id === agentId), readAgentApiKey),
  mcpGate: (repoId) => mcpServersHeldForRun(repoId),
  outboundSecrets,
  // Phase 154 follow-up: a chat turn under a custom agent, over the agent's private MCP socket. Built per
  // turn so the sockets (which read `userData`) are never touched before the app is ready.
  profileRun: async (profileId, cwd) => {
    const run = await createProfileHeadlessRun({
      sockets: studioProfileMcpSockets(),
      profile: getAgentProfile,
      agents: listAgents,
      promptPath: agentProfilePromptPath,
      runId: (launchId) => `chat-${launchId}`,
      // #1697/#1713: the breaker finds the turn's custom agent (its limits apply) and can stop the run.
      runs: studioHeadlessRuns(),
      // #1718: a chat is not the companion talking, so its refusals are neutral and point at its own picker.
      pickHint: CHATS_PICK_HINT,
      voice: 'neutral',
    })(profileId, cwd);
    return run.kind === 'ready' ? { ...run, extraArgs: run.extraArgs ?? [] } : run;
  },
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
  beforeSend: (chat) => getUnifiedSessionCoordinator().beforeChatSend(chat),
  onTurnEnd: (chat) => getUnifiedSessionCoordinator().onChatTurnEnd(chat),
};

let runtime: ChatsRuntime = createChatsRuntime(null, deps);

export function getChatsRuntime(): ChatsRuntime {
  return runtime;
}

export function configureChats(userDataDir: string): void {
  runtime = createChatsRuntime(userDataDir, deps);
}

/** Kill any running turn and flush pending writes — app quit. */
export function disposeChats(): void {
  void runtime.service.shutdown();
}

export function registerChatsHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('chats never trashes')),
  };
  chatsMain.register(ctx, {
    runtime: () => runtime,
    repoPath: (repoId) => (repoId ? (getRepo(repoId)?.path ?? null) : null),
    home: homedir,
    readAgentHistory: agentHistoryReadsEnabled,
  });
}
