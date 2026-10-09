import { createElement } from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { applyNotesDelta, diffNotes, useNotesStore, type Note } from '../store/notes-store';
import { useBroadcastSync } from './broadcast-sync';

// vitest/jsdom: a store transition and a relayed message, no real second window.

type RelayMessage = { id: string; origin: string; kind: string; payload: Record<string, unknown> };

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  repoId: 'r1',
  body: id,
  status: 'captured',
  done: false,
  createdAt: 1,
  updatedAt: 1,
  order: 0,
  ...over,
});

describe('notes delta merge', () => {
  it('diffNotes reports changed/added by reference and removed by id', () => {
    const a = note('a');
    const b = note('b');
    const b2 = { ...b, body: 'edited' };
    const c = note('c');
    expect(diffNotes({ a, b }, { a, b: b2, c })).toEqual({ upserts: [b2, c], deletedIds: [] });
    expect(diffNotes({ a, b }, { a })).toEqual({ upserts: [], deletedIds: ['b'] });
  });

  it('keeps edits to different notes from both windows', () => {
    const local = { a: note('a', { body: 'local', updatedAt: 5 }), b: note('b') };
    const merged = applyNotesDelta(local, {
      upserts: [note('b', { body: 'remote', updatedAt: 6 })],
      deletedIds: [],
    });
    expect(merged['a']?.body).toBe('local');
    expect(merged['b']?.body).toBe('remote');
  });

  it('never lets a stale remote copy overwrite a newer local edit', () => {
    const local = { a: note('a', { body: 'newer', updatedAt: 9 }) };
    const merged = applyNotesDelta(local, {
      upserts: [note('a', { body: 'older', updatedAt: 3 })],
      deletedIds: [],
    });
    expect(merged).toBe(local);
  });

  it('accepts an equal-timestamp copy so a pure reorder lands', () => {
    const merged = applyNotesDelta(
      { a: note('a', { order: 0 }) },
      { upserts: [note('a', { order: 4 })], deletedIds: [] },
    );
    expect(merged['a']?.order).toBe(4);
  });

  it('applies deletions, and ignores ones it does not have', () => {
    const local = { a: note('a') };
    expect(applyNotesDelta(local, { upserts: [], deletedIds: ['a'] })).toEqual({});
    expect(applyNotesDelta(local, { upserts: [], deletedIds: ['zz'] })).toBe(local);
  });
});

describe('notes sync through useBroadcastSync', () => {
  let relay: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let emit: (m: RelayMessage) => void;

  beforeEach(() => {
    relay = vi.fn();
    save = vi.fn();
    let handler: ((m: RelayMessage) => void) | null = null;
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      window: {
        relay,
        onRelayed: (h: (m: RelayMessage) => void) => {
          handler = h;
          return () => {
            handler = null;
          };
        },
      } as unknown as MidniteStudioBridge['window'],
      notes: {
        save,
        delete: vi.fn(),
        reorder: vi.fn(),
        list: vi.fn(),
      } as unknown as MidniteStudioBridge['notes'],
    };
    emit = (m) => handler?.(m);
    useNotesStore.setState({ notes: {}, hydrated: true });
    const client = new QueryClient();
    renderHook(() => useBroadcastSync(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  const notesMessages = () =>
    relay.mock.calls.map((c) => c[0] as RelayMessage).filter((m) => m.kind === 'notes');

  it('a local edit is persisted once and relayed as a delta', () => {
    const added = useNotesStore.getState().addNote('r1', 'hello');
    expect(save).toHaveBeenCalledTimes(1);
    const sent = notesMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toEqual({ upserts: [added], deletedIds: [] });
  });

  it('a relayed edit lands in the store without a second save or a rebroadcast', () => {
    emit({
      id: 'n1',
      origin: 'other-window',
      kind: 'notes',
      payload: { upserts: [note('x', { body: 'from popout' })], deletedIds: [] },
    });
    expect(useNotesStore.getState().notes['x']?.body).toBe('from popout');
    expect(save).not.toHaveBeenCalled();
    expect(notesMessages()).toHaveLength(0);
  });

  it("does not re-send a peer's note along with the next local edit", () => {
    emit({ id: 'n2', origin: 'other-window', kind: 'notes', payload: { upserts: [note('x')], deletedIds: [] } });
    useNotesStore.getState().addNote('r1', 'mine');
    const [msg] = notesMessages();
    expect((msg?.payload['upserts'] as Note[]).map((n) => n.body)).toEqual(['mine']);
  });

  it('a relayed deletion removes the note locally without calling delete', () => {
    useNotesStore.setState({ notes: { x: note('x') } });
    emit({ id: 'n3', origin: 'other-window', kind: 'notes', payload: { upserts: [], deletedIds: ['x'] } });
    expect(useNotesStore.getState().notes).toEqual({});
  });

  it('hydration is not relayed', () => {
    useNotesStore.setState({ hydrated: false });
    relay.mockClear();
    useNotesStore.setState({ notes: { d: note('d') }, hydrated: true });
    expect(notesMessages()).toHaveLength(0);
  });
});
