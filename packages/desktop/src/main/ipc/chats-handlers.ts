import { homedir } from 'node:os';
import { basename } from 'node:path';

import {
  chatsMain,
  createChatsRuntime,
  type ChatsRuntime,
  type ChatsRuntimeDeps,
} from '@midnite/studio-feature-chats/main';
import { getConfiguredOllamaHost, ollamaChatStream, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { getRepo } from '../repo-registry';
import { listAgents } from '../terminal-service';
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
 * No key is read here: a turn spawns the roster CLI with its own login, and the
 * Ollama stream is the local daemon.
 *
 * Injected at boot with a store rooted at `app.getPath('userData')`, like
 * `configureNotes`; until then the service runs on an in-memory store.
 */
const deps: ChatsRuntimeDeps = {
  agents: listAgents,
  resolveRepo: (repoId) => {
    const entry = getRepo(repoId);
    return entry ? { id: entry.id, path: entry.path, name: basename(entry.path) } : null;
  },
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.chatsEvent, event),
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

let runtime: ChatsRuntime = createChatsRuntime(null, deps);

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
  });
}
