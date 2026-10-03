import {
  DEFAULT_CHAT_MODE,
  type Chat,
  type ChatAttachment,
  type ChatChangeDecision,
  type ChatChangeSet,
  type ChatEvent,
  type ChatMessage,
  type ChatMode,
  type ChatSummary,
  type GitOpResult,
} from '@midnite/studio-shared';
import { create } from 'zustand';

import { bridge } from '../../services/bridge';
import { noBridge } from '../../services/bridge-result';

/**
 * Renderer state for the Chats page.
 *
 * The conversations themselves live in main (`main/chats/`); this store holds
 * the list, the chats the user has opened, which one is selected, and the
 * composer's settings for a chat that does not exist yet. Streaming arrives as
 * `ChatEvent`s — {@link reduceChatEvent} folds them in, and anything that is not
 * a delta is a cue to refetch, because `chatsGet` is the authority once a
 * message settles.
 *
 * Not persisted, apart from the composer's last-used engine/model/mode in
 * `localStorage` (a per-viewer convenience; the page works without it): a
 * selected id ages out the moment its chat is deleted, like Sessions'.
 */

export type ChatDraft = { engine: string | null; model: string | null; mode: ChatMode; repoId: string | null };

const PREFS_KEY = 'midnite.chats.composer';
const DEFAULT_DRAFT: ChatDraft = { engine: null, model: null, mode: DEFAULT_CHAT_MODE, repoId: null };

function readPrefs(): Pick<ChatDraft, 'engine' | 'model' | 'mode'> {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { engine: null, model: null, mode: DEFAULT_CHAT_MODE };
    const parsed = JSON.parse(raw) as Partial<ChatDraft>;
    return {
      engine: typeof parsed.engine === 'string' ? parsed.engine : null,
      model: typeof parsed.model === 'string' ? parsed.model : null,
      mode: parsed.mode === 'ask' || parsed.mode === 'edit' ? parsed.mode : DEFAULT_CHAT_MODE,
    };
  } catch {
    return { engine: null, model: null, mode: DEFAULT_CHAT_MODE };
  }
}

function writePrefs(draft: ChatDraft): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ engine: draft.engine, model: draft.model, mode: draft.mode }));
  } catch {
    // Private window, blocked storage — the page renders fine without it.
  }
}

/** Whether a chat has a reply being written right now. */
export function isStreaming(chat: Chat | undefined): boolean {
  return chat?.messages.some((m) => m.status === 'streaming') ?? false;
}

/** Merge runs of deltas for one message into one event — fewer renders, same text. */
export function coalesceEvents(events: readonly ChatEvent[]): ChatEvent[] {
  const out: ChatEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (event.kind === 'delta' && last?.kind === 'delta' && last.chatId === event.chatId && last.messageId === event.messageId) {
      out[out.length - 1] = { ...last, text: last.text + event.text };
    } else {
      out.push(event);
    }
  }
  return out;
}

/** Id prefix of the user message shown optimistically while a send is in flight. */
export const PENDING_PREFIX = 'pending-';

const upsert = (messages: ChatMessage[], message: ChatMessage): ChatMessage[] => {
  const index = messages.findIndex((m) => m.id === message.id);
  if (index === -1) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return next;
};

/** Fold one streaming event into the loaded chats. Pure. */
export function reduceChatEvent(chats: Record<string, Chat>, event: ChatEvent): Record<string, Chat> {
  const chat = chats[event.chatId];
  if (event.kind === 'removed') {
    if (!chat) return chats;
    const { [event.chatId]: _gone, ...rest } = chats;
    void _gone;
    return rest;
  }
  if (!chat) return chats;
  switch (event.kind) {
    case 'delta': {
      const index = chat.messages.findIndex((m) => m.id === event.messageId);
      if (index === -1) return chats;
      const messages = [...chat.messages];
      messages[index] = { ...messages[index]!, text: messages[index]!.text + event.text };
      return { ...chats, [chat.id]: { ...chat, messages } };
    }
    case 'activity': {
      const index = chat.messages.findIndex((m) => m.id === event.messageId);
      if (index === -1) return chats;
      const messages = [...chat.messages];
      const current = messages[index]!;
      messages[index] = { ...current, activity: [...(current.activity ?? []), event.line] };
      return { ...chats, [chat.id]: { ...chat, messages } };
    }
    case 'message': {
      // The real user message replaces the optimistic one shown at send time.
      const base = event.message.role === 'user' ? chat.messages.filter((m) => !m.id.startsWith(PENDING_PREFIX)) : chat.messages;
      return { ...chats, [chat.id]: { ...chat, messages: upsert(base, event.message) } };
    }
    default:
      return chats;
  }
}

/**
 * A fetched chat can be a beat behind the deltas that already reached us (the
 * reply and the event stream are separate paths). For a message still
 * streaming, keep whichever copy of its text is longer — streamed text only
 * ever grows, and the settled `message` event replaces it with the authority.
 */
export function mergeStreamed(local: Chat | undefined, fetched: Chat): Chat {
  if (!local) return fetched;
  const messages = fetched.messages.map((m) => {
    if (m.status !== 'streaming') return m;
    const mine = local.messages.find((l) => l.id === m.id);
    return mine && mine.text.length > m.text.length ? { ...m, text: mine.text } : m;
  });
  return { ...fetched, messages };
}

export type SendInput = { text?: string; attachments?: ChatAttachment[]; fromMessageId?: string };

type ChatsState = {
  list: ChatSummary[];
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  chats: Record<string, Chat>;
  /** A selected chat that failed to load (deleted elsewhere). */
  loadError: string | null;
  /** `null` is the "new chat" screen: the composer's settings are the draft. */
  selectedId: string | null;
  draft: ChatDraft;

  refreshList: () => Promise<void>;
  loadChat: (id: string) => Promise<void>;
  select: (id: string | null) => void;
  applyEvents: (events: readonly ChatEvent[]) => void;
  setDraft: (patch: Partial<ChatDraft>) => void;

  /** Create (when there is no selected chat) and send. Resolves the envelope of the send. */
  sendMessage: (input: SendInput) => Promise<GitOpResult<{ messageId: string }>>;
  retry: (chatId: string, assistantMessageId: string) => Promise<GitOpResult<{ messageId: string }>>;
  cancel: (chatId: string) => Promise<void>;
  updateChat: (chatId: string, patch: { title?: string; pinned?: boolean; engine?: string; model?: string | null; mode?: ChatMode; repoId?: string | null }) => Promise<GitOpResult>;
  removeChats: (ids: readonly string[]) => Promise<GitOpResult>;
  resolveChanges: (chatId: string, changeSetId: string, decisions: ChatChangeDecision[]) => Promise<GitOpResult<{ changeSet: ChatChangeSet }>>;
};

export const useChatsStore = create<ChatsState>()((set, get) => ({
  list: [],
  listStatus: 'idle',
  chats: {},
  loadError: null,
  selectedId: null,
  draft: { ...DEFAULT_DRAFT, ...readPrefs() },

  refreshList: async () => {
    const api = bridge();
    if (!api) {
      set({ listStatus: 'ready' });
      return;
    }
    if (get().listStatus === 'idle') set({ listStatus: 'loading' });
    try {
      const { chats } = await api.chats.list();
      set({ list: chats, listStatus: 'ready' });
    } catch {
      set({ listStatus: 'error' });
    }
  },

  loadChat: async (id) => {
    const api = bridge();
    if (!api) return;
    const result = await api.chats.get({ id });
    if (result.ok) {
      set((s) => ({
        chats: { ...s.chats, [id]: mergeStreamed(s.chats[id], result.value.chat) },
        loadError: s.selectedId === id ? null : s.loadError,
      }));
    } else if (get().selectedId === id) {
      set({ loadError: result.kind === 'error' ? result.message : 'That chat could not be opened.' });
    }
  },

  select: (id) => {
    set({ selectedId: id, loadError: null });
    if (id !== null) void get().loadChat(id);
  },

  applyEvents: (events) => {
    if (events.length === 0) return;
    let chats = get().chats;
    let removedSelected = false;
    const refetch = new Set<string>();
    let listDirty = false;
    for (const event of coalesceEvents(events)) {
      chats = reduceChatEvent(chats, event);
      if (event.kind === 'removed' && get().selectedId === event.chatId) removedSelected = true;
      if (event.kind === 'chat' || event.kind === 'removed') listDirty = true;
      if (event.kind === 'message' && event.message.status !== 'streaming') refetch.add(event.chatId);
    }
    set({ chats, ...(removedSelected ? { selectedId: null } : {}) });
    if (listDirty) void get().refreshList();
    for (const id of refetch) if (get().chats[id]) void get().loadChat(id);
  },

  setDraft: (patch) => {
    const draft = { ...get().draft, ...patch };
    set({ draft });
    writePrefs(draft);
  },

  sendMessage: async (input) => {
    const api = bridge();
    if (!api) return noBridge();
    let chatId = get().selectedId;
    if (chatId === null) {
      const draft = get().draft;
      if (draft.engine === null) return { ok: false, kind: 'error', message: 'Pick an engine first.' };
      const created = await api.chats.create({ engine: draft.engine, model: draft.model, mode: draft.mode, repoId: draft.repoId });
      if (!created.ok) return created;
      chatId = created.value.chat.id;
      set((s) => ({ chats: { ...s.chats, [chatId!]: created.value.chat }, selectedId: chatId }));
      void get().refreshList();
    }
    // Show the message at once, before the round trip: a rewind (edit / retry) drops everything
    // from the edited message on in main, and the `message` events that follow only append, so
    // drop it here first too — and put the new text in its place so the thread never empties
    // (which would flash the new-chat screen). The real user message, when it arrives, replaces
    // this one (`reduceChatEvent`).
    const target = chatId;
    set((s) => {
      const chat = s.chats[target];
      if (!chat) return s;
      const rewindAt = input.fromMessageId === undefined ? -1 : chat.messages.findIndex((m) => m.id === input.fromMessageId);
      const kept = rewindAt >= 0 ? chat.messages.slice(0, rewindAt) : chat.messages;
      const text = (input.text ?? (rewindAt >= 0 ? chat.messages[rewindAt]?.text : '') ?? '').trim();
      const attachments = input.attachments ?? (rewindAt >= 0 ? chat.messages[rewindAt]?.attachments : undefined);
      const optimistic: ChatMessage = {
        id: `${PENDING_PREFIX}${Date.now()}`,
        role: 'user',
        text,
        createdAt: Date.now(),
        status: 'done',
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };
      return { chats: { ...s.chats, [target]: { ...chat, messages: [...kept, optimistic] } } };
    });
    // No refetch on success: main emits the user and assistant `message` events before it
    // answers, and a fetch racing the first deltas could only lose text.
    const result = await api.chats.send({ chatId, ...input });
    if (!result.ok) await get().loadChat(chatId);
    return result;
  },

  retry: async (chatId, assistantMessageId) => {
    const chat = get().chats[chatId];
    if (!chat) return { ok: false, kind: 'error', message: 'That chat is not open.' };
    const index = chat.messages.findIndex((m) => m.id === assistantMessageId);
    const user = chat.messages.slice(0, Math.max(index, 0)).reverse().find((m) => m.role === 'user');
    if (!user) return { ok: false, kind: 'error', message: 'There is no message to retry.' };
    return get().sendMessage({ fromMessageId: user.id });
  },

  cancel: async (chatId) => {
    await bridge()?.chats.cancel({ chatId });
  },

  updateChat: async (chatId, patch) => {
    const api = bridge();
    if (!api) return noBridge();
    const result = await api.chats.update({ id: chatId, ...patch });
    if (result.ok) {
      set((s) => ({ chats: { ...s.chats, [chatId]: result.value.chat } }));
      void get().refreshList();
      return { ok: true };
    }
    return result;
  },

  removeChats: async (ids) => {
    const api = bridge();
    if (!api) return noBridge();
    const result = await api.chats.delete({ ids: [...ids] });
    if (result.ok) {
      set((s) => {
        const chats = { ...s.chats };
        for (const id of ids) delete chats[id];
        return { chats, selectedId: s.selectedId !== null && ids.includes(s.selectedId) ? null : s.selectedId };
      });
      void get().refreshList();
    }
    return result;
  },

  resolveChanges: async (chatId, changeSetId, decisions) => {
    const api = bridge();
    if (!api) return noBridge();
    const result = await api.chats.resolveChanges({ chatId, changeSetId, decisions });
    // A conflict still changed state (the files that did apply), so refetch either way.
    await get().loadChat(chatId);
    void get().refreshList();
    return result;
  },
}));

/** Test seam: back to a clean slate. */
export function resetChatsStore(): void {
  useChatsStore.setState({
    list: [],
    listStatus: 'idle',
    chats: {},
    loadError: null,
    selectedId: null,
    draft: { ...DEFAULT_DRAFT },
  });
}
