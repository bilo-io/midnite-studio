import { renderHook, waitFor, act } from '@testing-library/react';
import type { Chat, ChatEvent, ChatMessage } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { installMockBridgeJsdom, type MockFixtures } from '../../../test-support/mock-bridge';
import { coalesceEvents, isStreaming, mergeStreamed, reduceChatEvent, resetChatsStore, useChatsStore } from './chats-store';
import { useChatEvents } from './use-chat-events';

// vitest/jsdom: reducers, event batching and the store's actions against the mock bridge.

const message = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: 'assistant',
  text: '',
  createdAt: 1,
  status: 'done',
  ...over,
});

const chat = (id: string, messages: ChatMessage[] = []): Chat => ({
  id,
  title: id,
  engine: 'claude',
  model: null,
  mode: 'edit',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  messages,
  session: null,
});

describe('reduceChatEvent', () => {
  const state = { c1: chat('c1', [message('u', { role: 'user', text: 'hi' }), message('a', { status: 'streaming', text: 'He' })]) };

  it('appends a delta to its message, leaving the rest by reference', () => {
    const next = reduceChatEvent(state, { kind: 'delta', chatId: 'c1', messageId: 'a', text: 'llo' });
    expect(next.c1!.messages[1]!.text).toBe('Hello');
    expect(next.c1!.messages[0]).toBe(state.c1.messages[0]);
  });

  it('collects activity lines', () => {
    const next = reduceChatEvent(state, { kind: 'activity', chatId: 'c1', messageId: 'a', line: 'Edit a.ts' });
    expect(next.c1!.messages[1]!.activity).toEqual(['Edit a.ts']);
  });

  it('upserts a message by id, and appends an unknown one', () => {
    const replaced = reduceChatEvent(state, { kind: 'message', chatId: 'c1', message: message('a', { text: 'Hello', status: 'done' }) });
    expect(replaced.c1!.messages).toHaveLength(2);
    expect(replaced.c1!.messages[1]).toMatchObject({ text: 'Hello', status: 'done' });
    const appended = reduceChatEvent(state, { kind: 'message', chatId: 'c1', message: message('z') });
    expect(appended.c1!.messages.map((m) => m.id)).toEqual(['u', 'a', 'z']);
  });

  it('the real user message replaces the optimistic one shown at send time — never both', () => {
    const optimistic = { ...state.c1, messages: [message('pending-1', { role: 'user', text: 'typed' })] };
    const next = reduceChatEvent({ c1: optimistic }, { kind: 'message', chatId: 'c1', message: message('real-u', { role: 'user', text: 'typed' }) });
    expect(next.c1!.messages.map((m) => m.id)).toEqual(['real-u']);
    // An assistant message leaves it alone (it is not the user's echo).
    const kept = reduceChatEvent({ c1: optimistic }, { kind: 'message', chatId: 'c1', message: message('a2') });
    expect(kept.c1!.messages.map((m) => m.id)).toEqual(['pending-1', 'a2']);
  });

  it('ignores events for a chat that is not loaded, and a delta for a message it does not have', () => {
    expect(reduceChatEvent(state, { kind: 'delta', chatId: 'nope', messageId: 'a', text: 'x' })).toBe(state);
    expect(reduceChatEvent(state, { kind: 'delta', chatId: 'c1', messageId: 'zzz', text: 'x' })).toBe(state);
  });

  it('drops a removed chat', () => {
    expect(reduceChatEvent(state, { kind: 'removed', chatId: 'c1' })).toEqual({});
  });
});

describe('coalesceEvents', () => {
  const delta = (messageId: string, text: string, chatId = 'c1'): ChatEvent => ({ kind: 'delta', chatId, messageId, text });

  it('merges runs of deltas for one message into one event, in order', () => {
    expect(coalesceEvents([delta('a', 'He'), delta('a', 'll'), delta('a', 'o')])).toEqual([delta('a', 'Hello')]);
  });

  it('keeps messages, chats and non-delta events apart and in order', () => {
    const out = coalesceEvents([delta('a', '1'), delta('b', '2'), { kind: 'chat', chatId: 'c1' }, delta('b', '3')]);
    expect(out).toEqual([delta('a', '1'), delta('b', '2'), { kind: 'chat', chatId: 'c1' }, delta('b', '3')]);
  });
});

describe('mergeStreamed / isStreaming', () => {
  it('keeps the longer of two copies of a still-streaming message', () => {
    const local = chat('c', [message('a', { status: 'streaming', text: 'Hello wor' })]);
    const fetched = chat('c', [message('a', { status: 'streaming', text: 'Hello' })]);
    expect(mergeStreamed(local, fetched).messages[0]!.text).toBe('Hello wor');
  });

  it('takes the fetched copy for a settled message', () => {
    const local = chat('c', [message('a', { status: 'streaming', text: 'Hello world, longer' })]);
    const fetched = chat('c', [message('a', { status: 'done', text: 'Hello' })]);
    expect(mergeStreamed(local, fetched).messages[0]!.text).toBe('Hello');
  });

  it('is the fetched chat when nothing is loaded yet', () => {
    const fetched = chat('c');
    expect(mergeStreamed(undefined, fetched)).toBe(fetched);
  });

  it('knows when a reply is being written', () => {
    expect(isStreaming(chat('c', [message('a', { status: 'streaming' })]))).toBe(true);
    expect(isStreaming(chat('c', [message('a')]))).toBe(false);
    expect(isStreaming(undefined)).toBe(false);
  });
});

describe('the store, against the mock bridge', () => {
  const install = (chats: MockFixtures['chats'] = {}) => installMockBridgeJsdom({ ...fixtures, chats });

  beforeEach(() => {
    resetChatsStore();
    window.localStorage.clear();
  });
  afterEach(() => {
    delete (window as { midniteStudio?: unknown }).midniteStudio;
  });

  const settled = (id: string) =>
    waitFor(() => {
      const last = useChatsStore.getState().chats[id]?.messages.at(-1);
      expect(last).toMatchObject({ role: 'assistant', status: 'done' });
    });

  it('creates a chat from the draft on the first send, selects it and streams the reply into it', async () => {
    install({ reply: 'Hello from the agent.' });
    const events = renderHook(() => useChatEvents());
    useChatsStore.getState().setDraft({ engine: 'claude', mode: 'ask' });

    let result;
    await act(async () => {
      result = await useChatsStore.getState().sendMessage({ text: 'Say hello' });
    });
    expect(result).toMatchObject({ ok: true });

    const id = useChatsStore.getState().selectedId!;
    expect(id).toBeTruthy();
    await settled(id);
    const state = useChatsStore.getState().chats[id]!;
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Say hello'],
      ['assistant', 'Hello from the agent.'],
    ]);
    expect(state.title).toBe('Say hello');
    await waitFor(() => expect(useChatsStore.getState().list.map((c) => c.id)).toContain(id));
    events.unmount();
  });

  it('shows the sent message straight away, before main has answered', async () => {
    install({ reply: 'later' });
    useChatsStore.getState().setDraft({ engine: 'claude' });
    const pending = useChatsStore.getState().sendMessage({ text: 'instant' });
    // `create` resolves on a microtask; by the time the send is in flight the bubble is already there.
    await waitFor(() => {
      const id = useChatsStore.getState().selectedId;
      expect(useChatsStore.getState().chats[id ?? '']?.messages.map((m) => m.text)).toContain('instant');
    });
    await pending;
  });

  it('refuses to start a chat with no engine chosen', async () => {
    install();
    expect(await useChatsStore.getState().sendMessage({ text: 'hi' })).toMatchObject({ ok: false, message: 'Pick an engine first.' });
  });

  it('streams text before the reply settles (the message is streaming while deltas land)', async () => {
    install({ reply: 'abcdefghi' });
    const events = renderHook(() => useChatEvents());
    useChatsStore.getState().setDraft({ engine: 'claude' });
    await act(async () => {
      await useChatsStore.getState().sendMessage({ text: 'go' });
    });
    const id = useChatsStore.getState().selectedId!;
    await waitFor(() => expect(isStreaming(useChatsStore.getState().chats[id])).toBe(true));
    await settled(id);
    events.unmount();
  });

  it('edit rewinds the thread and replays from that message; retry re-sends the same text', async () => {
    install({ reply: 'ok' });
    const events = renderHook(() => useChatEvents());
    useChatsStore.getState().setDraft({ engine: 'claude' });
    await act(async () => {
      await useChatsStore.getState().sendMessage({ text: 'first' });
    });
    const id = useChatsStore.getState().selectedId!;
    await settled(id);
    const firstUser = useChatsStore.getState().chats[id]!.messages[0]!;

    await act(async () => {
      await useChatsStore.getState().sendMessage({ fromMessageId: firstUser.id, text: 'first, edited' });
    });
    await settled(id);
    expect(useChatsStore.getState().chats[id]!.messages.map((m) => m.text)).toEqual(['first, edited', 'ok']);

    const assistant = useChatsStore.getState().chats[id]!.messages[1]!;
    await act(async () => {
      await useChatsStore.getState().retry(id, assistant.id);
    });
    await settled(id);
    expect(useChatsStore.getState().chats[id]!.messages.map((m) => m.text)).toEqual(['first, edited', 'ok']);
    events.unmount();
  });

  it('cancel settles the streaming message as cancelled', async () => {
    install({ reply: 'a long reply that would take a while' });
    const events = renderHook(() => useChatEvents());
    useChatsStore.getState().setDraft({ engine: 'claude' });
    await act(async () => {
      await useChatsStore.getState().sendMessage({ text: 'go' });
    });
    const id = useChatsStore.getState().selectedId!;
    await act(async () => {
      await useChatsStore.getState().cancel(id);
    });
    await waitFor(() => expect(useChatsStore.getState().chats[id]!.messages.at(-1)!.status).toBe('cancelled'));
    events.unmount();
  });

  it('removing the selected chat returns to the new-chat screen', async () => {
    install();
    useChatsStore.getState().setDraft({ engine: 'claude' });
    await act(async () => {
      await useChatsStore.getState().sendMessage({ text: 'hi' });
    });
    const id = useChatsStore.getState().selectedId!;
    await act(async () => {
      await useChatsStore.getState().removeChats([id]);
    });
    expect(useChatsStore.getState().selectedId).toBeNull();
    expect(useChatsStore.getState().chats[id]).toBeUndefined();
  });

  it('a failed send puts the rewound thread back from main', async () => {
    install({ seed: [chat('c1', [message('u1', { role: 'user', text: 'one' }), message('a1', { text: 'two' })])], sendError: 'Nope.' });
    await useChatsStore.getState().refreshList();
    useChatsStore.getState().select('c1');
    await waitFor(() => expect(useChatsStore.getState().chats.c1).toBeTruthy());
    const result = await useChatsStore.getState().sendMessage({ fromMessageId: 'u1', text: 'edited' });
    expect(result).toMatchObject({ ok: false, message: 'Nope.' });
    expect(useChatsStore.getState().chats.c1!.messages).toHaveLength(2);
  });

  it('remembers the composer engine, model and mode — but never the repo — for next time', () => {
    install();
    useChatsStore.getState().setDraft({ engine: 'codex', model: null, mode: 'ask', repoId: 'repo-1' });
    const saved = JSON.parse(window.localStorage.getItem('midnite.chats.composer')!);
    expect(saved).toEqual({ engine: 'codex', model: null, mode: 'ask' });
  });

  it('survives storage that throws', () => {
    install();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => useChatsStore.getState().setDraft({ mode: 'ask' })).not.toThrow();
      expect(useChatsStore.getState().draft.mode).toBe('ask');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
