import { z } from 'zod';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { nullNotesStore, type NotesStore } from '../notes-store';
import { handle, handleSend } from './handle';

/**
 * IPC handlers for notes persisted on disk (Phase 86 Theme F).
 *
 * Modelled on `sessions-handlers.ts` and `terminal-handlers.ts`:
 * - `list` is an invoke returning all notes (or notes for a given repo).
 * - `save`, `delete`, and `reorder` are one-way `send`s handled asynchronously
 *   by the notes store's debounced, serialized per-repo write queue.
 */

let store: NotesStore = nullNotesStore;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureNotes(next: NotesStore): void {
  store = next;
}

const NotesListRequestLoose = z.preprocess(
  (raw) => raw ?? {},
  schemas.NotesListRequest.catch({}),
) as z.ZodType<{ repoId?: string }>;

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

export function registerNotesHandlers(): void {
  handle(
    CHANNELS.notesList,
    NotesListRequestLoose,
    async (req) => ({ notes: await store.list(req.repoId) }),
    (issue) => {
      warnInvalid(issue);
      return { notes: [] };
    },
  );

  handleSend(
    CHANNELS.notesSave,
    schemas.NotesSaveRequest,
    ({ note }) => void store.save(note),
    warnInvalid,
  );

  handleSend(
    CHANNELS.notesDelete,
    schemas.NotesDeleteRequest,
    ({ id, repoId }) => void store.delete(id, repoId),
    warnInvalid,
  );

  handleSend(
    CHANNELS.notesReorder,
    schemas.NotesReorderRequest,
    ({ repoId, noteIds }) => void store.reorder(repoId, noteIds),
    warnInvalid,
  );
}

/** Reset module state. Tests only. */
export function resetNotesHandlersForTest(): void {
  store = nullNotesStore;
}
