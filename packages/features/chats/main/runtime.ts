import { join } from 'node:path';

import { createChatService, type ChatService, type ChatServiceDeps } from './chat-service';
import { createChatStore, createMemoryChatStore } from './chat-store';

/** What a composer supplies — the service's deps minus the paths and store this module chooses. */
export type ChatsRuntimeDeps = Omit<ChatServiceDeps, 'store' | 'sandboxRoot' | 'scratchRoot'>;

/** The chats feature's service, built over one directory. */
export type ChatsRuntime = {
  service: ChatService;
  /** `<root>/scratch` — where a chat with no repository works, `<scratchRoot>/<chatId>`. */
  scratchRoot: string;
};

/**
 * Builds the chat service rooted at `<directory>/chats` (desktop passes
 * `userData`, so nothing a user stored moved; Agents passes its own runtime
 * data directory). With no directory the service runs on an in-memory store —
 * what desktop uses until `userData` is known.
 */
export function createChatsRuntime(directory: string | null, deps: ChatsRuntimeDeps): ChatsRuntime {
  const root = join(directory ?? join('/tmp', 'midnite-chats-root'), 'chats');
  const scratchRoot = join(root, 'scratch');
  const service = createChatService({
    ...deps,
    store: directory === null ? createMemoryChatStore() : createChatStore(directory),
    // Only emptied now — older builds kept per-turn repo copies here.
    sandboxRoot: join(root, 'sandboxes'),
    scratchRoot,
  });
  return { service, scratchRoot };
}
