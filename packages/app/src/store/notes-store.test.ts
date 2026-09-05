import { beforeEach, describe, expect, it } from 'vitest';

import { Note, notesForRepo, useNotesStore } from './notes-store';

describe('notes-store', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {} });
  });

  it('adds, edits, and removes a note', () => {
    const store = useNotesStore.getState();
    const created = store.addNote('repo-1', 'Initial thought');

    expect(created.id).toBeDefined();
    expect(created.repoId).toBe('repo-1');
    expect(created.body).toBe('Initial thought');
    expect(created.status).toBe('captured');
    expect(created.done).toBe(false);
    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBe(created.createdAt);

    store.setBody(created.id, 'Updated thought');
    const updated = useNotesStore.getState().notes[created.id];
    expect(updated?.body).toBe('Updated thought');

    store.removeNote(created.id);
    expect(useNotesStore.getState().notes[created.id]).toBeUndefined();
  });

  it('keeps status and done as independent axes', () => {
    const store = useNotesStore.getState();
    const note = store.addNote('repo-1', 'Independent axes');

    store.setStatus(note.id, 'planned');
    let current = useNotesStore.getState().notes[note.id];
    expect(current?.status).toBe('planned');
    expect(current?.done).toBe(false);

    store.toggleDone(note.id);
    current = useNotesStore.getState().notes[note.id];
    expect(current?.status).toBe('planned');
    expect(current?.done).toBe(true);

    store.setStatus(note.id, 'implemented');
    current = useNotesStore.getState().notes[note.id];
    expect(current?.status).toBe('implemented');
    expect(current?.done).toBe(true);

    store.toggleDone(note.id);
    current = useNotesStore.getState().notes[note.id];
    expect(current?.status).toBe('implemented');
    expect(current?.done).toBe(false);
  });

  it('bumps updatedAt and not createdAt on mutations', async () => {
    const store = useNotesStore.getState();
    const note = store.addNote('repo-1', 'Timing check');
    const initialCreatedAt = note.createdAt;
    const initialUpdatedAt = note.updatedAt;

    // Small delay to ensure timestamp increments
    await new Promise((resolve) => setTimeout(resolve, 5));

    store.setBody(note.id, 'New body');
    const afterBody = useNotesStore.getState().notes[note.id]!;
    expect(afterBody.createdAt).toBe(initialCreatedAt);
    expect(afterBody.updatedAt).toBeGreaterThan(initialUpdatedAt);

    await new Promise((resolve) => setTimeout(resolve, 5));
    store.setStatus(note.id, 'planned');
    const afterStatus = useNotesStore.getState().notes[note.id]!;
    expect(afterStatus.createdAt).toBe(initialCreatedAt);
    expect(afterStatus.updatedAt).toBeGreaterThan(afterBody.updatedAt);
  });

  it('sorts notesForRepo newest first (createdAt descending)', () => {
    const noteA: Note = {
      id: 'a',
      repoId: 'repo-1',
      body: 'Oldest',
      status: 'captured',
      done: false,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const noteB: Note = {
      id: 'b',
      repoId: 'repo-1',
      body: 'Newest',
      status: 'captured',
      done: false,
      createdAt: 3000,
      updatedAt: 3000,
    };
    const noteC: Note = {
      id: 'c',
      repoId: 'repo-1',
      body: 'Middle',
      status: 'captured',
      done: false,
      createdAt: 2000,
      updatedAt: 2000,
    };
    const noteOtherRepo: Note = {
      id: 'd',
      repoId: 'repo-2',
      body: 'Other repo',
      status: 'captured',
      done: false,
      createdAt: 4000,
      updatedAt: 4000,
    };

    const sorted = notesForRepo([noteA, noteB, noteC, noteOtherRepo], 'repo-1');
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('prunes notes only for absent repositories', () => {
    const store = useNotesStore.getState();
    store.addNote('repo-keep-1', 'Keep 1');
    store.addNote('repo-keep-2', 'Keep 2');
    store.addNote('repo-stale-1', 'Stale 1');
    store.addNote('repo-stale-2', 'Stale 2');

    const prunedCount = store.pruneMissingRepos(['repo-keep-1', 'repo-keep-2']);
    expect(prunedCount).toBe(2);

    const remaining = Object.values(useNotesStore.getState().notes);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((n) => n.repoId).sort()).toEqual(['repo-keep-1', 'repo-keep-2']);
  });

  it('partialize outputs only the notes record', () => {
    const persistOptions = (useNotesStore as unknown as {
      persist: { getOptions: () => { partialize: (state: unknown) => unknown } };
    }).persist.getOptions();

    const state = {
      notes: {
        'note-1': {
          id: 'note-1',
          repoId: 'repo-1',
          body: 'Persisted note',
          status: 'captured' as const,
          done: false,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      addNote: () => ({}),
      setBody: () => {},
      setStatus: () => {},
      toggleDone: () => {},
      removeNote: () => {},
      pruneMissingRepos: () => 0,
    };

    const partialized = persistOptions.partialize(state);
    expect(partialized).toEqual({ notes: state.notes });
    expect(Object.keys(partialized as object)).toEqual(['notes']);
  });
});
