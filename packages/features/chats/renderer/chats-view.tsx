import { useState } from 'react';

import { ChatPane } from './chat-pane';
import { ChatsExplorer } from './chats-explorer';
import { EMPTY_FILTERS, type ChatFilters } from './chats-filter';
import { useChatsStore } from './chats-store';
import { useChatEngines } from './use-chat-engines';
import { useChatEvents } from './use-chat-events';
import { ResizeHandle, useResizable, useToastStore } from '@midnite/studio-frame';
import { useChatsHost } from './host';

/**
 * The Chats page: conversations with the roster's agent CLIs and local Ollama
 * models, in the Sessions page's own layout — an explorer on the left (the same
 * filters, search and repo grouping), the content in the centre. Sessions has no
 * right-hand panel, so neither does this.
 *
 * The centre is a chat UI: a scrolling thread, a centred composer pinned to the
 * bottom, and — when an agent edits files — an inline card that opens a review
 * modal. See `chat-pane.tsx`.
 *
 * Detachable like every other page: it fetches its own list over IPC and
 * subscribes to main's event stream, which broadcasts to every window.
 */
export function ChatsView() {
  const width = useChatsHost().useListWidth();
  const list = useResizable({
    size: width.size,
    onSize: width.setSize,
    initial: width.initial,
    axis: 'x',
    min: width.min,
    max: width.max,
  });

  useChatEvents();
  const { engines } = useChatEngines();
  const chats = useChatsStore((s) => s.list);
  const status = useChatsStore((s) => s.listStatus);
  const selectedId = useChatsStore((s) => s.selectedId);
  const [filters, setFilters] = useState<ChatFilters>(EMPTY_FILTERS);

  const fail = (result: { ok: boolean; kind?: string; message?: string }) => {
    if (!result.ok && result.kind === 'error') useToastStore.getState().addToast({ message: result.message ?? 'That did not work.', status: 'error' });
  };

  return (
    <div className="flex h-full min-h-0">
      <div style={{ width: list.current }} className="flex min-h-0 shrink-0 flex-col border-r border-border">
        <ChatsExplorer
          chats={chats}
          status={status}
          engines={engines}
          selectedId={selectedId}
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={(id) => useChatsStore.getState().select(id)}
          onNew={() => useChatsStore.getState().select(null)}
          onRename={(chat, title) => void useChatsStore.getState().updateChat(chat.id, { title }).then(fail)}
          onPin={(chat, pinned) => void useChatsStore.getState().updateChat(chat.id, { pinned }).then(fail)}
          onDelete={(chat) => void useChatsStore.getState().removeChats([chat.id]).then(fail)}
        />
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize the chats list" />
      <ChatPane selectedId={selectedId} />
    </div>
  );
}
