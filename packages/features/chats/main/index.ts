import { join } from 'node:path';

import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, ok, schemas, type GitOpResult } from '@midnite/studio-shared';

import { chatsManifest } from '../manifest';
import { listChatFiles } from './chat-files';
import { discoverChatSkills } from './chat-skills';
import type { ChatsRuntime } from './runtime';

export { chatsManifest, type ChatsManifest } from '../manifest';
export { createChatService, CHAT_TURN_TIMEOUT_MS, type ChatService, type ChatServiceDeps, type GitSeam } from './chat-service';
export { createChatStore, createMemoryChatStore, type ChatStore } from './chat-store';
export { createChatsRuntime, type ChatsRuntime, type ChatsRuntimeDeps } from './runtime';

/**
 * The chats feature's main half (Phase 113 Theme N).
 *
 * The Chats page's IPC surface. Every channel answers a `GitOpResult` — a
 * missing chat, a CLI that is not installed and a patch that no longer applies
 * are sentences the page renders, never exceptions. A turn's text rides
 * `EVENT_CHANNELS.chatsEvent` (the composer's `emit`, wired into the service by
 * the composer), so a popped-out Chats page and the docked one stay in step.
 *
 * **No key is read here.** A turn spawns the roster CLI with its own login, or
 * streams a local model through the composer's `ollamaStream`; the service
 * never sees a credential.
 */
export type ChatsMainServices = {
  /**
   * The service and its scratch root, read lazily on every call — desktop
   * registers its handlers before `userData` is known and swaps the runtime in
   * afterwards (`configureChats`).
   */
  runtime: () => ChatsRuntime;
  /** The checkout path of an open repository, or `null`. */
  repoPath: (repoId: string | null) => string | null;
  /** The user's home directory — where user-level skills live. */
  home: () => string;
};

/** A chat id that is safe as one path segment — the scratch dir is `<scratchRoot>/<id>`. */
const SAFE_SEGMENT = /^[A-Za-z0-9][\w.-]*$/;

export const chatsMain = defineFeatureMain<ChatsMainServices>({
  feature: chatsManifest.feature,
  channels: chatsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const svc = () => services.runtime().service;
    const invalid = (issue: string): GitOpResult => failure(issue);

    ipc.handleBare(CHANNELS.chatsList, async () => ({ chats: await svc().list() }));
    ipc.handle(CHANNELS.chatsGet, schemas.ChatsGetRequest, (req) => svc().get(req.id), invalid);
    ipc.handle(CHANNELS.chatsCreate, schemas.ChatsCreateRequest, (req) => svc().create(req), invalid);
    ipc.handle(CHANNELS.chatsUpdate, schemas.ChatsUpdateRequest, (req) => svc().update(req), invalid);
    ipc.handle(CHANNELS.chatsDelete, schemas.ChatsDeleteRequest, (req) => svc().remove(req.ids), invalid);
    ipc.handle(CHANNELS.chatsSend, schemas.ChatsSendRequest, (req) => svc().send(req), invalid);
    ipc.handle(CHANNELS.chatsCancel, schemas.ChatsCancelRequest, (req) => svc().cancel(req.chatId), invalid);
    ipc.handle(
      CHANNELS.chatsChangeDiffs,
      schemas.ChatsChangeDiffsRequest,
      (req) => svc().changeDiffs(req.chatId, req.changeSetId),
      invalid,
    );
    ipc.handle(CHANNELS.chatsResolveChanges, schemas.ChatsResolveChangesRequest, (req) => svc().resolveChanges(req), invalid);

    // The composer's `/` and `@` pickers. Both are suggestion lists: a folder
    // that cannot be read is an empty list, never a failure the page renders.
    ipc.handle(
      CHANNELS.chatsSkills,
      schemas.ChatsSkillsRequest,
      async (req) => ok({ skills: await discoverChatSkills({ engine: req.engine, repoPath: services.repoPath(req.repoId), home: services.home() }) }),
      invalid,
    );
    ipc.handle(
      CHANNELS.chatsFiles,
      schemas.ChatsFilesRequest,
      async (req) => {
        const repoPath = services.repoPath(req.repoId);
        const scratchDir =
          repoPath === null && req.chatId !== null && SAFE_SEGMENT.test(req.chatId) ? join(services.runtime().scratchRoot, req.chatId) : null;
        return ok(await listChatFiles({ repoPath, scratchDir }));
      },
      invalid,
    );
  },
});
