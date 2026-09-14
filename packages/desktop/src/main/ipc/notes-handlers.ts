import { CHANNELS, schemas } from '@midnite/studio-shared';
import { ipcMain } from 'electron';

import { nullNotesStore, type NotesStore } from '../notes-store';

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

export function registerNotesHandlers(): void {
  ipcMain.handle(CHANNELS.notesList, async (_event, raw: unknown) => {
    const parsed = schemas.NotesListRequest.safeParse(raw ?? {});
    const repoId = parsed.success ? parsed.data?.repoId : undefined;
    return { notes: await store.list(repoId) };
  });

  ipcMain.on(CHANNELS.notesSave, (_event, raw: unknown) => {
    const parsed = schemas.NotesSaveRequest.safeParse(raw);
    if (parsed.success) {
      void store.save(parsed.data.note);
    }
  });

  ipcMain.on(CHANNELS.notesDelete, (_event, raw: unknown) => {
    const parsed = schemas.NotesDeleteRequest.safeParse(raw);
    if (parsed.success) {
      void store.delete(parsed.data.id, parsed.data.repoId);
    }
  });

  ipcMain.on(CHANNELS.notesReorder, (_event, raw: unknown) => {
    const parsed = schemas.NotesReorderRequest.safeParse(raw);
    if (parsed.success) {
      void store.reorder(parsed.data.repoId, parsed.data.noteIds);
    }
  });
}

/** Reset module state. Tests only. */
export function resetNotesHandlersForTest(): void {
  store = nullNotesStore;
}
