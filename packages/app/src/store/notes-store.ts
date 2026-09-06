import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { adoptRenamedPersistKey } from './persist-rename';

export type NoteStatus = 'captured' | 'planned' | 'implemented';

export type Note = {
  id: string;
  repoId: string;
  body: string;
  status: NoteStatus;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  /**
   * Manual position within the repository's list, ascending — the note the
   * user dragged to the top is the one with the lowest number, whatever its
   * age. Notes were sorted `createdAt` descending before Phase-less ad hoc
   * work gave the list a drag handle, and that sort is still what a fresh
   * repo's numbers happen to encode: `addNote` prepends by taking one below
   * the current minimum, and the v1 → v2 migration stamps existing notes in
   * exactly the order they used to render. So nothing moves on upgrade.
   */
  order: number;
};

export type NotesState = {
  notes: Record<string, Note>;
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
function seedOrder(notes: Record<string, Note>): Record<string, Note> {
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
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.notes', 'midnite-studio.notes');

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: {},

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
        return note;
      },

      setBody: (id: string, body: string) => {
        set((state) => {
          const note = state.notes[id];
          if (!note) return state;
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, body, updatedAt: Date.now() },
            },
          };
        });
      },

      setStatus: (id: string, status: NoteStatus) => {
        set((state) => {
          const note = state.notes[id];
          if (!note) return state;
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, status, updatedAt: Date.now() },
            },
          };
        });
      },

      toggleDone: (id: string) => {
        set((state) => {
          const note = state.notes[id];
          if (!note) return state;
          return {
            notes: {
              ...state.notes,
              [id]: { ...note, done: !note.done, updatedAt: Date.now() },
            },
          };
        });
      },

      removeNote: (id: string) => {
        set((state) => {
          if (!state.notes[id]) return state;
          const next = { ...state.notes };
          delete next[id];
          return { notes: next };
        });
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
          [...named, ...rest].forEach((id, index) => {
            const note = next[id];
            // `updatedAt` is untouched: a drag changes where a note sits, not
            // what it says, and the row's own "edited" reading is the body's.
            if (note) next[id] = { ...note, order: index };
          });
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
          }
        }
        if (count > 0) {
          set({ notes: next });
        }
        return count;
      },
    }),
    {
      name: 'midnite-studio.notes',
      version: 2,
      /**
       * v1 → v2: `order` (manual drag-to-reorder). Seeded from the sort v1
       * rendered in, so the first paint after an upgrade is identical.
       */
      migrate: (persisted, version) => {
        const notes = ((persisted ?? {}) as { notes?: Record<string, Note> }).notes ?? {};
        return { notes: version < 2 ? seedOrder(notes) : notes };
      },
      partialize: (state) => ({ notes: state.notes }),
    },
  ),
);
