// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, type Note } from '@midnite/studio-shared';

import { notesManifest } from '../manifest';
import { nullNotesStore, notesMain, type NotesStore } from './index';

const note: Note = {
  id: 'n1',
  repoId: 'r1',
  body: 'hello',
  status: 'captured',
  done: false,
  createdAt: 1,
  updatedAt: 1,
  order: 0,
};

function fakeStore(): NotesStore {
  return {
    list: vi.fn(async () => [note]),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    reorder: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
  };
}

describe('notes main', () => {
  it('registers exactly the manifest channels', () => {
    const ctx = createRecordingContext();
    notesMain.register(ctx, { store: () => nullNotesStore });
    expect([...ctx.channels].sort()).toEqual([...notesManifest.ipc].sort());
  });

  it('lists through the store, tolerating a missing or malformed payload', async () => {
    const ctx = createRecordingContext();
    const store = fakeStore();
    notesMain.register(ctx, { store: () => store });
    expect(await ctx.invoke(CHANNELS.notesList, undefined)).toEqual({ notes: [note] });
    expect(await ctx.invoke(CHANNELS.notesList, { repoId: 'r1' })).toEqual({ notes: [note] });
    expect(store.list).toHaveBeenLastCalledWith('r1');
  });

  it('writes one-way and reports a bad payload instead of throwing', async () => {
    const ctx = createRecordingContext();
    const store = fakeStore();
    const warn = vi.fn();
    notesMain.register(ctx, { store: () => store, warn });
    await ctx.invoke(CHANNELS.notesSave, { note });
    await ctx.invoke(CHANNELS.notesDelete, { id: 'n1', repoId: 'r1' });
    await ctx.invoke(CHANNELS.notesReorder, { repoId: 'r1', noteIds: ['n1'] });
    expect(store.save).toHaveBeenCalledWith(note);
    expect(store.delete).toHaveBeenCalledWith('n1', 'r1');
    expect(store.reorder).toHaveBeenCalledWith('r1', ['n1']);
    await ctx.invoke(CHANNELS.notesSave, { note: 'nope' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads the store lazily, so it can be configured after registration', async () => {
    const ctx = createRecordingContext();
    let current: NotesStore = nullNotesStore;
    notesMain.register(ctx, { store: () => current });
    expect(await ctx.invoke(CHANNELS.notesList, {})).toEqual({ notes: [] });
    current = fakeStore();
    expect(await ctx.invoke(CHANNELS.notesList, {})).toEqual({ notes: [note] });
  });
});
