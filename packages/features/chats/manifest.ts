import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The chats feature — Agents' home view (Phase 113 Theme N), copying the
 * monitor's template (`../monitor/manifest.ts`).
 *
 * A chat is a conversation with one agent CLI (or a local Ollama model),
 * stored app-wide and carrying the repository it was started in. The store,
 * the engines (how each CLI is invoked and its stream parsed) and the turn
 * service moved here from `packages/desktop/src/main/chats`; the Chats view,
 * the composer and the change-review card moved from `packages/app`. Chats are
 * global: a chat is reachable with no repository open.
 *
 * **No LLM key crosses this feature.** A turn spawns the roster CLI, which
 * brings its own login; a local-model turn goes to the Ollama daemon through
 * `ChatsMainServices.ollamaStream`, which the composer implements (and which
 * reads any key in main). Nothing here reads, stores or answers a key.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const chatsManifest = defineFeatureManifest({
  feature: 'chats',
  owner: 'agents',
  views: [
    {
      id: 'chats',
      // Global: chats are stored app-wide, each carrying the repo it was started in.
      global: true,
      rail: {
        group: 'pinned',
        label: 'Chats',
        description: 'Talk to your agents, and review the changes they propose before they land',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.chatsList,
    CHANNELS.chatsGet,
    CHANNELS.chatsCreate,
    CHANNELS.chatsUpdate,
    CHANNELS.chatsDelete,
    CHANNELS.chatsSend,
    CHANNELS.chatsCancel,
    CHANNELS.chatsChangeDiffs,
    CHANNELS.chatsResolveChanges,
    CHANNELS.chatsSkills,
    CHANNELS.chatsFiles,
  ],
  events: [EVENT_CHANNELS.chatsEvent],
  mcpTools: [],
});

export type ChatsManifest = typeof chatsManifest;
