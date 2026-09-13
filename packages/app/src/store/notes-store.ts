import { NoteSchema, type Note, type NoteStatus } from '@midnite/studio-shared';
import { create } from 'zustand';

import { bridge } from '../services/bridge';
import { adoptRenamedPersistKey } from './persist-rename';

export type { Note, NoteStatus };
export { NoteSchema };

export type NotesState = {
  notes: Record<string, Note>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addNote: (repoId: string, body: string) => Note;
  setBody: (id: string, body: string) => void;
  setStatus: (id: string, status: NoteStatus) => void;
  toggleDone: (id: string) => void;
  removeNote: (id: string) => void;
  /**
   * Rewrite one repository's manual order. Takes the full new id list rather
   * than a from/to pair — idempotent, and it is what `SortableList` hands
   * back anyway.
   */
  reorderNotes: (repoId: string, orderedIds: string[]) => void;
  pruneMissingRepos: (validRepoIds: readonly string[] | string[]) => number;
};

/**
 * Pure module-level selector returning notes for a repository in the user's
 * own order (`order` ascending), newest first among any that tie.
 *
 * The tie-break is not decoration: two notes captured inside the same
 * millisecond both take `min - 1` from `addNote`, and `Array.prototype.sort`
 * is stable but the record `Object.values` walks is not ordered by anything
 * the user can see.
 */
export function notesForRepo(notes: Note[], repoId: string): Note[] {
  return notes
    .filter((note) => note.repoId === repoId)
    .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

/**
 * Stamp `order` onto notes persisted before the field existed, per repository,
 * in the descending-`createdAt` order they used to render in.
 */
export function seedOrder(notes: Record<string, Note>): Record<string, Note> {
  const byRepo = new Map<string, Note[]>();
  for (const note of Object.values(notes)) {
    const bucket = byRepo.get(note.repoId);
    if (bucket) bucket.push(note);
    else byRepo.set(note.repoId, [note]);
  }
  const next: Record<string, Note> = {};
  for (const bucket of byRepo.values()) {
    bucket
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((note, index) => {
        next[note.id] = { ...note, order: index };
      });
  }
  return next;
}

/**
 * v1 → v2: `order` (manual drag-to-reorder). Seeded from the sort v1
 * rendered in, so the first paint after an upgrade is identical.
 */
export function migrateV1ToV2(
  persisted: unknown,
  version: number,
): { notes: Record<string, Note> } {
  const notes = ((persisted ?? {}) as { notes?: Record<string, Note> }).notes ?? {};
  return { notes: version < 2 ? seedOrder(notes) : notes };
}

export const NOTES_PERSIST_KEY = 'midnite-studio.notes';

export type MigrationStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * A one-way localStorage -> disk migration that cannot lose a note.
 *
 * It runs once, writes disk first, verifies the read-back, and only then marks
 * the localStorage payload migrated — it never deletes it.
 */
export async function migrateNotesFromLocalStorage(
  api: ReturnType<typeof bridge>,
  storage: MigrationStorage = typeof window !== 'undefined'
    ? window.localStorage
    : { getItem: () => null, setItem: () => {} },
): Promise<boolean> {
  if (!api) return false;

  const raw = storage.getItem(NOTES_PERSIST_KEY);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unparseable payload; cannot safely migrate
    return false;
  }

  if (typeof parsed !== 'object' || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  if (record.migrated === true) {
    return false;
  }

  const version = typeof record.version === 'number' ? record.version : 1;
  const migratedV2 = migrateV1ToV2(record.state ?? record, version);
  const notesRecord = migratedV2.notes ?? {};
  const notesToSave: Note[] = [];

  for (const n of Object.values(notesRecord)) {
    const validated = NoteSchema.safeParse(n);
    if (validated.success) {
      notesToSave.push(validated.data);
    }
  }

  if (notesToSave.length > 0) {
    // 1. Write to disk store via IPC
    for (const note of notesToSave) {
      api.notes.save({ note });
    }

    // 2. Verify read-back
    const readBack = await api.notes.list();
    const diskNotesById = new Map(readBack.notes.map((n) => [n.id, n]));

    for (const note of notesToSave) {
      const found = diskNotesById.get(note.id);
      if (!found || found.body !== note.body || found.repoId !== note.repoId) {
        // Read-back verification failed! Do not mark as migrated to prevent data loss.
        return false;
      }
    }
  }

  // 3. Mark the localStorage payload as migrated, preserving raw data
  const updatedPayload = {
    ...record,
    migrated: true,
    migratedAt: Date.now(),
  };
  storage.setItem(NOTES_PERSIST_KEY, JSON.stringify(updatedPayload));
  return true;
}

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey(NOTES_PERSIST_KEY, NOTES_PERSIST_KEY);

export const useNotesStore = create<NotesState>()((set, get) => ({
  notes: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const api = bridge();
    if (!api) {
      set({ hydrated: true });
      return;
    }

    try {
      await migrateNotesFromLocalStorage(api);
      const res = await api.notes.list();
      const diskRecord: Record<string, Note> = {};
      for (const note of res.notes) {
        diskRecord[note.id] = note;
      }
      set((state) => ({
        notes: { ...diskRecord, ...state.notes },
        hydrated: true,
      }));
    } catch {
      set({ hydrated: true });
    }
  },

  addNote: (repoId: string, body: string): Note => {
    const now = Date.now();
    // One below the repository's current minimum, so a new thought lands
    // at the top of the list the user is already looking at — the place
    // `createdAt` descending used to put it.
    const orders = Object.values(get().notes)
      .filter((n) => n.repoId === repoId)
      .map((n) => n.order);
    const note: Note = {
      id: crypto.randomUUID(),
      repoId,
      body,
      status: 'captured',
      done: false,
      createdAt: now,
      updatedAt: now,
      order: orders.length > 0 ? Math.min(...orders) - 1 : 0,
    };
    set((state) => ({
      notes: { ...state.notes, [note.id]: note },
    }));
    bridge()?.notes.save({ note });
    return note;
  },

  setBody: (id: string, body: string) => {
    set((state) => {
      const note = state.notes[id];
      if (!note) return state;
      const updated = { ...note, body, updatedAt: Date.now() };
      bridge()?.notes.save({ note: updated });
      return {
        notes: {
          ...state.notes,
          [id]: updated,
        },
      };
    });
  },

  setStatus: (id: string, status: NoteStatus) => {
    set((state) => {
      const note = state.notes[id];
      if (!note) return state;
      const updated = { ...note, status, updatedAt: Date.now() };
      bridge()?.notes.save({ note: updated });
      return {
        notes: {
          ...state.notes,
          [id]: updated,
        },
      };
    });
  },

  toggleDone: (id: string) => {
    set((state) => {
      const note = state.notes[id];
      if (!note) return state;
      const updated = { ...note, done: !note.done, updatedAt: Date.now() };
      bridge()?.notes.save({ note: updated });
      return {
        notes: {
          ...state.notes,
          [id]: updated,
        },
      };
    });
  },

  removeNote: (id: string) => {
    const note = get().notes[id];
    if (!note) return;
    set((state) => {
      const next = { ...state.notes };
      delete next[id];
      return { notes: next };
    });
    bridge()?.notes.delete({ id, repoId: note.repoId });
  },

  /**
   * Renumber one repository's notes to `orderedIds`, 0..n-1.
   *
   * Ids belonging to another repo — or to a note that vanished between the
   * drag starting and ending — are skipped rather than trusted, and any
   * note of this repo the caller left out keeps its relative position by
   * being appended in its current order. A partial list is the normal case:
   * with "Hide completed" on, the list being dragged is a *subset*.
   */
  reorderNotes: (repoId: string, orderedIds: string[]) => {
    set((state) => {
      const named = orderedIds.filter((id) => state.notes[id]?.repoId === repoId);
      if (named.length === 0) return state;

      const namedSet = new Set(named);
      const rest = notesForRepo(Object.values(state.notes), repoId)
        .filter((note) => !namedSet.has(note.id))
        .map((note) => note.id);

      const next = { ...state.notes };
      const fullOrdered = [...named, ...rest];
      fullOrdered.forEach((id, index) => {
        const note = next[id];
        // `updatedAt` is untouched: a drag changes where a note sits, not
        // what it says, and the row's own "edited" reading is the body's.
        if (note) next[id] = { ...note, order: index };
      });
      bridge()?.notes.reorder({ repoId, noteIds: fullOrdered });
      return { notes: next };
    });
  },

  pruneMissingRepos: (validRepoIds: readonly string[] | string[]) => {
    const validSet = new Set(validRepoIds);
    const current = get().notes;
    let count = 0;
    const next: Record<string, Note> = {};
    for (const [id, note] of Object.entries(current)) {
      if (validSet.has(note.repoId)) {
        next[id] = note;
      } else {
        count++;
        bridge()?.notes.delete({ id, repoId: note.repoId });
      }
    }
    if (count > 0) {
      set({ notes: next });
    }
    return count;
  },
}));

// Backward-compatibility hook for test access
(useNotesStore as unknown as { persist: unknown }).persist = {
  getOptions: () => ({
    migrate: migrateV1ToV2,
    partialize: (state: unknown) => ({ notes: (state as NotesState).notes }),
  }),
};
