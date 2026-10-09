import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { CHANNELS, EVENT_CHANNELS, failure, ok, schemas, type GitOpResult } from '@midnite/studio-shared';

import { listChatFiles } from '../chats/chat-files';
import { createChatService, type ChatService } from '../chats/chat-service';
import { discoverChatSkills } from '../chats/chat-skills';
import { createChatStore, createMemoryChatStore } from '../chats/chat-store';
import { ollamaChatStream, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { getRepo } from '../repo-registry';
import { listAgents } from '../terminal-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare } from './handle';

/**
 * The Chats page's IPC surface (`main/chats/`). Every channel answers a
 * `GitOpResult` — a missing chat, a CLI that is not installed and a patch that
 * no longer applies are sentences the page renders, never exceptions. A turn's
 * text rides `EVENT_CHANNELS.chatsEvent` to every window, so a popped-out
 * Chats page and the docked one stay in step.
 *
 * Injected at boot with a store rooted at `app.getPath('userData')`, like
 * `configureNotes`; until then the service runs on an in-memory store.
 */

let chatsRoot = join('/tmp', 'midnite-chats');
let service: ChatService = build(createMemoryChatStore(), chatsRoot);

function build(store: ReturnType<typeof createChatStore>, root: string): ChatService {
  return createChatService({
    store,
    agents: listAgents,
    resolveRepo: (repoId) => {
      const entry = getRepo(repoId);
      return entry ? { id: entry.id, path: entry.path, name: basename(entry.path) } : null;
    },
    emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.chatsEvent, event),
    // Only emptied now — older builds kept per-turn repo copies here.
    sandboxRoot: join(root, 'sandboxes'),
    scratchRoot: scratchRootOf(root),
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
  });
}

function scratchRootOf(root: string): string {
  return join(root, 'scratch');
}

/** A chat id that is safe as one path segment — the scratch dir is `<scratchRoot>/<id>`. */
const SAFE_SEGMENT = /^[A-Za-z0-9][\w.-]*$/;

const repoPathOf = (repoId: string | null): string | null => (repoId ? (getRepo(repoId)?.path ?? null) : null);

export function configureChats(userDataDir: string): void {
  chatsRoot = join(userDataDir, 'chats');
  service = build(createChatStore(userDataDir), chatsRoot);
}

/** Kill any running turn and flush pending writes — app quit. */
export function disposeChats(): void {
  void service.shutdown();
}

export function registerChatsHandlers(): void {
  const invalid = (issue: string): GitOpResult => failure(issue);

  handleBare(CHANNELS.chatsList, async () => ({ chats: await service.list() }));
  handle(CHANNELS.chatsGet, schemas.ChatsGetRequest, (req) => service.get(req.id), invalid);
  handle(CHANNELS.chatsCreate, schemas.ChatsCreateRequest, (req) => service.create(req), invalid);
  handle(CHANNELS.chatsUpdate, schemas.ChatsUpdateRequest, (req) => service.update(req), invalid);
  handle(CHANNELS.chatsDelete, schemas.ChatsDeleteRequest, (req) => service.remove(req.ids), invalid);
  handle(CHANNELS.chatsSend, schemas.ChatsSendRequest, (req) => service.send(req), invalid);
  handle(CHANNELS.chatsCancel, schemas.ChatsCancelRequest, (req) => service.cancel(req.chatId), invalid);
  handle(
    CHANNELS.chatsChangeDiffs,
    schemas.ChatsChangeDiffsRequest,
    (req) => service.changeDiffs(req.chatId, req.changeSetId),
    invalid,
  );
  handle(CHANNELS.chatsResolveChanges, schemas.ChatsResolveChangesRequest, (req) => service.resolveChanges(req), invalid);

  // The composer's `/` and `@` pickers. Both are suggestion lists: a folder
  // that cannot be read is an empty list, never a failure the page renders.
  handle(
    CHANNELS.chatsSkills,
    schemas.ChatsSkillsRequest,
    async (req) => ok({ skills: await discoverChatSkills({ engine: req.engine, repoPath: repoPathOf(req.repoId), home: homedir() }) }),
    invalid,
  );
  handle(
    CHANNELS.chatsFiles,
    schemas.ChatsFilesRequest,
    async (req) => {
      const repoPath = repoPathOf(req.repoId);
      const scratchDir =
        repoPath === null && req.chatId !== null && SAFE_SEGMENT.test(req.chatId) ? join(scratchRootOf(chatsRoot), req.chatId) : null;
      return ok(await listChatFiles({ repoPath, scratchDir }));
    },
    invalid,
  );
}
