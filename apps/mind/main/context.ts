import { createNotesStore, createReviewService, notesMain, type NotesStore } from '@midnite/studio-feature-notes/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { MIND_NOTEBOOK_ID } from '@midnite/studio-shared';

import { registerMindKnowledge } from './knowledge';

/** The electron pieces Mind's main needs, injected so registration is testable under bare vitest. */
export type MindElectron = IpcContextElectron & {
  /** Where notes live: `<userData>/notes/<notebook>.json`, under the runtime's data directory. */
  notesDirectory: string;
  /** Where the Knowledge view's laid-out positions are cached: `<userData>/knowledge-cache`. */
  knowledgeCacheDirectory: string;
  /** Where a malformed payload is reported. */
  warn?: (issue: string) => void;
};

/**
 * Registers every channel Mind's renderer can call: the notes feature's seven and the Knowledge view's three. Returns the store so
 * the caller can flush it before the app quits (writes are debounced).
 */
export function registerMindHandlers(el: MindElectron): NotesStore {
  const store = createNotesStore(el.notesDirectory);
  const review = createReviewService({ directory: el.notesDirectory, store: () => store });
  const ctx = createIpcContext(el);
  // The Knowledge tab's graph is Mind's own notebook, read through the same store the notes tab writes.
  registerMindKnowledge(ctx, {
    notes: () => store.list(MIND_NOTEBOOK_ID),
    cacheDirectory: el.knowledgeCacheDirectory,
  });
  notesMain.register(ctx, {
    store: () => store,
    review: () => review,
    // Mind has no Inbox: a capture sent to its own channel lands in its one notebook.
    capture: async (body) => {
      const at = Date.now();
      const existing = await store.list(MIND_NOTEBOOK_ID);
      const note = {
        id: crypto.randomUUID(),
        repoId: MIND_NOTEBOOK_ID,
        body: body.trim(),
        status: 'captured' as const,
        done: false,
        createdAt: at,
        updatedAt: at,
        order: existing.length > 0 ? Math.min(...existing.map((n) => n.order)) - 1 : 0,
      };
      await store.save(note);
      return { ok: true, target: 'mind' as const, noteId: note.id };
    },
    ...(el.warn ? { warn: el.warn } : {}),
  });
  return store;
}
