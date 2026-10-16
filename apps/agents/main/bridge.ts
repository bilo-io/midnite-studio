import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Agents exposes — exactly what the chats, councils and models
 * features' renderers call, and nothing else: `chats.*`, `council.*`, `ollama.*`, `agent.list` (the
 * roster) and `secrets.has` (a boolean about the Ollama cloud key, never its value). Every other
 * bridge namespace is deliberately absent, and so is `secrets.get`/`secrets.set` — no LLM key ever
 * reaches this window (`bridge.test.ts` holds the list).
 */
export type AgentsBridge = {
  chats: MidniteStudioBridge['chats'];
  council: MidniteStudioBridge['council'];
  ollama: MidniteStudioBridge['ollama'];
  agent: Pick<MidniteStudioBridge['agent'], 'list'>;
  secrets: Pick<MidniteStudioBridge['secrets'], 'has'>;
};

export type { RendererIpc };

export function createAgentsBridge(ipc: RendererIpc): AgentsBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    chats: {
      list: () => call(CHANNELS.chatsList),
      get: (req) => call(CHANNELS.chatsGet, req),
      create: (req) => call(CHANNELS.chatsCreate, req),
      update: (req) => call(CHANNELS.chatsUpdate, req),
      delete: (req) => call(CHANNELS.chatsDelete, req),
      send: (req) => call(CHANNELS.chatsSend, req),
      cancel: (req) => call(CHANNELS.chatsCancel, req),
      changeDiffs: (req) => call(CHANNELS.chatsChangeDiffs, req),
      resolveChanges: (req) => call(CHANNELS.chatsResolveChanges, req),
      skills: (req) => call(CHANNELS.chatsSkills, req),
      files: (req) => call(CHANNELS.chatsFiles, req),
      onEvent: (handler) => subscribe(EVENT_CHANNELS.chatsEvent, handler),
    },
    council: {
      list: () => call(CHANNELS.councilList),
      get: (req) => call(CHANNELS.councilGet, req),
      create: (req) => call(CHANNELS.councilCreate, req),
      updateMembers: (req) => call(CHANNELS.councilUpdateMembers, req),
      remove: (req) => call(CHANNELS.councilRemove, req),
      run: {
        start: (req) => call(CHANNELS.councilRunStart, req),
        get: (req) => call(CHANNELS.councilRunGet, req),
        list: (req) => call(CHANNELS.councilRunListForCouncil, req),
        skipMember: (req) => call(CHANNELS.councilRunSkipMember, req),
        retryMember: (req) => call(CHANNELS.councilRunRetryMember, req),
      },
    },
    ollama: {
      status: () => call(CHANNELS.ollamaStatus),
      list: () => call(CHANNELS.ollamaList),
      show: (req) => call(CHANNELS.ollamaShow, req),
      ps: () => call(CHANNELS.ollamaPs),
      pull: (req) => call(CHANNELS.ollamaPull, req),
      pullCancel: (req) => call(CHANNELS.ollamaPullCancel, req),
      delete: (req) => call(CHANNELS.ollamaDelete, req),
      create: (req) => call(CHANNELS.ollamaCreate, req),
      unload: (req) => call(CHANNELS.ollamaUnload, req),
      onPullProgress: (handler) => subscribe(EVENT_CHANNELS.ollamaPullProgress, handler),
      settings: {
        get: () => call(CHANNELS.ollamaSettingsGet),
        set: (req) => call(CHANNELS.ollamaSettingsSet, req),
      },
      search: (req) => call(CHANNELS.ollamaSearch, req),
      cloudList: () => call(CHANNELS.ollamaCloudList),
      signInStatus: () => call(CHANNELS.ollamaSignInStatus),
    },
    agent: { list: () => call(CHANNELS.agentList) },
    secrets: { has: (req) => call(CHANNELS.secretsHas, req) },
  };
}
