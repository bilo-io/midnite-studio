import {
  createCapture,
  createReviewService,
  notesMain,
  nullNotesStore,
  type CaptureResult,
  type NotesStore,
  type ReviewService,
} from '@midnite/studio-feature-notes/main';
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
let review: ReviewService | null = null;
let capture: ((body: string) => Promise<CaptureResult>) | null = null;

/**
 * Injected at boot with a store rooted at `app.getPath('userData')`. `appData` is the base the launcher's
 * `installed.json` and Mind's data directory hang off — what quick capture reads to pick Mind or the Inbox.
 */
export function configureNotes(next: NotesStore, options?: { userData: string; appData: string }): void {
  store = next;
  if (options) {
    review = createReviewService({ directory: options.userData, store: () => store });
    capture = createCapture({ appData: options.appData, localStore: () => store });
  }
}

export function registerNotesHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => {},
    trashItem: () => Promise.reject(new Error('notes never trashes')),
  };
  notesMain.register(ctx, {
    store: () => store,
    review: () => review,
    capture: (body) => (capture ? capture(body) : Promise.resolve({ ok: false, target: 'inbox' as const })),
    warn: (issue) => defaultLogger.warn(issue),
  });
}

/** Reset module state. Tests only. */
export function resetNotesHandlersForTest(): void {
  store = nullNotesStore;
  review = null;
  capture = null;
}
