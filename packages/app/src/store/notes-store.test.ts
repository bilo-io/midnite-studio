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

  it('sorts notesForRepo by the manual order, tie-breaking on createdAt', () => {
    const noteA: Note = {
      id: 'a',
      repoId: 'repo-1',
      body: 'Dragged to the top',
      status: 'captured',
      done: false,
      createdAt: 1000,
      updatedAt: 1000,
      order: 0,
    };
    const noteB: Note = {
      id: 'b',
      repoId: 'repo-1',
      body: 'Newest, but dragged down',
      status: 'captured',
      done: false,
      createdAt: 3000,
      updatedAt: 3000,
      order: 2,
    };
    const noteC: Note = {
      id: 'c',
      repoId: 'repo-1',
      body: 'Middle',
      status: 'captured',
      done: false,
      createdAt: 2000,
      updatedAt: 2000,
      order: 1,
    };
    const noteOtherRepo: Note = {
      id: 'd',
      repoId: 'repo-2',
      body: 'Other repo',
      status: 'captured',
      done: false,
      createdAt: 4000,
      updatedAt: 4000,
      order: 0,
    };

    const sorted = notesForRepo([noteA, noteB, noteC, noteOtherRepo], 'repo-1');
    expect(sorted.map((n) => n.id)).toEqual(['a', 'c', 'b']);

    // Two notes captured in the same millisecond share an `order`; the newer
    // one still comes first.
    const tied = notesForRepo(
      [
        { ...noteA, id: 'tie-old', order: 5, createdAt: 10 },
        { ...noteA, id: 'tie-new', order: 5, createdAt: 20 },
      ],
      'repo-1',
    );
    expect(tied.map((n) => n.id)).toEqual(['tie-new', 'tie-old']);
  });

  it('migrates a v1 blob by stamping order in the createdAt-descending sort it rendered in', () => {
    const persistOptions = (
      useNotesStore as unknown as {
        persist: {
          getOptions: () => {
            migrate: (persisted: unknown, version: number) => { notes: Record<string, Note> };
          };
        };
      }
    ).persist.getOptions();

    const v1 = {
      notes: {
        old: { id: 'old', repoId: 'r1', body: 'old', status: 'captured', done: false, createdAt: 1, updatedAt: 1 },
        new: { id: 'new', repoId: 'r1', body: 'new', status: 'captured', done: false, createdAt: 9, updatedAt: 9 },
        other: { id: 'other', repoId: 'r2', body: 'other', status: 'captured', done: false, createdAt: 5, updatedAt: 5 },
      },
    };

    const migrated = persistOptions.migrate(v1, 1);
    expect(notesForRepo(Object.values(migrated.notes), 'r1').map((n) => n.id)).toEqual([
      'new',
      'old',
    ]);
    // Numbering restarts per repository.
    expect(migrated.notes.other?.order).toBe(0);
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
          order: 0,
        },
      },
      addNote: () => ({}),
      setBody: () => {},
      setStatus: () => {},
      toggleDone: () => {},
      removeNote: () => {},
      reorderNotes: () => {},
      pruneMissingRepos: () => 0,
    };

    const partialized = persistOptions.partialize(state);
    expect(partialized).toEqual({ notes: state.notes });
    expect(Object.keys(partialized as object)).toEqual(['notes']);
  });

  it('orders a repository by `order`, prepending each new note', () => {
    const store = useNotesStore.getState();
    const first = store.addNote('repo-1', 'first');
    const second = store.addNote('repo-1', 'second');
    const third = store.addNote('repo-1', 'third');

    const ordered = notesForRepo(Object.values(useNotesStore.getState().notes), 'repo-1');
    expect(ordered.map((n) => n.id)).toEqual([third.id, second.id, first.id]);
  });

  it('reorders a repository to the ids it is handed', () => {
    const store = useNotesStore.getState();
    const a = store.addNote('repo-1', 'a');
    const b = store.addNote('repo-1', 'b');
    const c = store.addNote('repo-1', 'c');

    store.reorderNotes('repo-1', [a.id, c.id, b.id]);

    const ordered = notesForRepo(Object.values(useNotesStore.getState().notes), 'repo-1');
    expect(ordered.map((n) => n.id)).toEqual([a.id, c.id, b.id]);
    // A drag moves a note, it does not edit one.
    expect(useNotesStore.getState().notes[a.id]?.updatedAt).toBe(a.updatedAt);
  });

  it('leaves other repositories, and ids it does not own, alone', () => {
    const store = useNotesStore.getState();
    const mine = store.addNote('repo-1', 'mine');
    const theirs = store.addNote('repo-2', 'theirs');

    store.reorderNotes('repo-1', ['missing-id', theirs.id, mine.id]);

    expect(useNotesStore.getState().notes[mine.id]?.order).toBe(0);
    expect(useNotesStore.getState().notes[theirs.id]?.order).toBe(theirs.order);
  });

  it('keeps notes left out of a partial reorder, in their existing order, after it', () => {
    const store = useNotesStore.getState();
    const a = store.addNote('repo-1', 'a');
    const b = store.addNote('repo-1', 'b');
    const c = store.addNote('repo-1', 'c');
    // Rendered order is c, b, a — reorder only the two the caller can see.
    store.reorderNotes('repo-1', [b.id, c.id]);

    const ordered = notesForRepo(Object.values(useNotesStore.getState().notes), 'repo-1');
    expect(ordered.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
  });
});
