import { notesMain, nullNotesStore, type NotesStore } from '@midnite/studio-feature-notes/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { defaultLogger } from '../log';
import { handle, handleBare, handleSend } from './handle';

/**
 * IPC handlers for notes persisted on disk (Phase 86 Theme F) — the handlers
 * themselves are the notes feature's main half (Phase 113 Theme M); this is
 * Studio's composition of it. The store is read lazily because the handlers
 * register before `userData` is known.
 */

let store: NotesStore = nullNotesStore;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureNotes(next: NotesStore): void {
  store = next;
}

export function registerNotesHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => {},
    trashItem: () => Promise.reject(new Error('notes never trashes')),
  };
  notesMain.register(ctx, {
    store: () => store,
    warn: (issue) => defaultLogger.warn(issue),
  });
}

/** Reset module state. Tests only. */
export function resetNotesHandlersForTest(): void {
  store = nullNotesStore;
}
