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
};

export type NotesState = {
  notes: Record<string, Note>;
  addNote: (repoId: string, body: string) => Note;
  setBody: (id: string, body: string) => void;
  setStatus: (id: string, status: NoteStatus) => void;
  toggleDone: (id: string) => void;
  removeNote: (id: string) => void;
  pruneMissingRepos: (validRepoIds: readonly string[] | string[]) => number;
};

/**
 * Pure module-level selector returning notes for a repository,
 * newest first (createdAt descending).
 */
export function notesForRepo(notes: Note[], repoId: string): Note[] {
  return notes
    .filter((note) => note.repoId === repoId)
    .sort((a, b) => b.createdAt - a.createdAt);
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
        const note: Note = {
          id: crypto.randomUUID(),
          repoId,
          body,
          status: 'captured',
          done: false,
          createdAt: now,
          updatedAt: now,
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
      version: 1,
      partialize: (state) => ({ notes: state.notes }),
    },
  ),
);
