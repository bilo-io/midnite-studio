import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, INBOX_NOTEBOOK_ID, schemas } from '@midnite/studio-shared';
import { z } from 'zod';

import { notesManifest } from '../manifest';
import type { CaptureResult } from './capture';
import type { NotesStore } from './notes-store';
import type { ReviewService } from './review/review-service';

export { captureTarget, createCapture, mindNotebookFile, type CaptureResult, type CaptureTarget } from './capture';
export { cardsFromNote, type DraftCard } from './review/cards';
export { createReviewService, reviewFilePath, type ReviewService } from './review/review-service';
export { schedule, isDue, type CardState } from './review/scheduler';

export { notesManifest, type NotesManifest } from '../manifest';
export {
  createNotesStore,
  nullNotesStore,
  parseNotesState,
  repoNotesPath,
  safeRepoId,
  sortNotes,
  type NotesStore,
  type NotesStoreOptions,
  type StoredNotesState,
} from './notes-store';

/**
 * The notes feature's main half (Phase 113 Theme M).
 *
 * The on-disk store moved here from `packages/desktop` — it imports no
 * `electron`, only `node:fs`. Where it is rooted stays the composer's call:
 * desktop roots it at `userData` (`userData/notes/<repoId>.json`, unchanged),
 * Mind roots it under its own runtime data directory.
 */
export type NotesMainServices = {
  /**
   * The store, read lazily on every call — desktop registers its handlers
   * before `userData` is known and configures the store afterwards.
   */
  store: () => NotesStore;
  /** Spaced practice over the store's notes; absent means Review is unavailable and answers empty. */
  review?: () => ReviewService | null;
  /**
   * Quick capture. Absent means the default: append to this store's Inbox notebook.
   * Studio passes `createCapture(...)`, which picks Mind's notebook when Mind is installed.
   */
  capture?: (body: string) => Promise<CaptureResult>;
  /** Where a malformed payload is reported (desktop's logger); dropped when absent. */
  warn?: (issue: string) => void;
};

/** `list` accepts no payload at all, or a malformed one, and answers "everything". */
const NotesListRequestLoose = z.preprocess(
  (raw) => raw ?? {},
  schemas.NotesListRequest.catch({}),
) as z.ZodType<{ repoId?: string }>;

export const notesMain = defineFeatureMain<NotesMainServices>({
  feature: notesManifest.feature,
  channels: notesManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const warn = (issue: string): void => services.warn?.(issue);

    ipc.handle(
      CHANNELS.notesList,
      NotesListRequestLoose,
      async (req) => ({ notes: await services.store().list(req.repoId) }),
      (issue) => {
        warn(issue);
        return { notes: [] };
      },
    );
    // One-way, like `pty.input`: the store debounces and serialises its own writes.
    ipc.send(CHANNELS.notesSave, schemas.NotesSaveRequest, ({ note }) => void services.store().save(note), warn);
    ipc.send(
      CHANNELS.notesDelete,
      schemas.NotesDeleteRequest,
      ({ id, repoId }) => void services.store().delete(id, repoId),
      warn,
    );
    ipc.send(
      CHANNELS.notesReorder,
      schemas.NotesReorderRequest,
      ({ repoId, noteIds }) => void services.store().reorder(repoId, noteIds),
      warn,
    );

    ipc.handle(
      CHANNELS.notesReviewDue,
      schemas.NotesReviewDueRequest,
      async ({ repoId }) => (await services.review?.()?.due(repoId)) ?? { cards: [], total: 0 },
      (issue) => {
        warn(issue);
        return { cards: [], total: 0 };
      },
    );
    ipc.handle(
      CHANNELS.notesReviewGrade,
      schemas.NotesReviewGradeRequest,
      async ({ repoId, cardId, grade }) =>
        (await services.review?.()?.grade(repoId, cardId, grade)) ?? { ok: false as const, reason: 'Review is unavailable' },
      (issue) => {
        warn(issue);
        return { ok: false as const, reason: 'Invalid request' };
      },
    );
    ipc.handle(
      CHANNELS.notesCapture,
      schemas.NotesCaptureRequest,
      async ({ body }) => {
        if (services.capture) return services.capture(body);
        const store = services.store();
        const at = Date.now();
        const existing = await store.list(INBOX_NOTEBOOK_ID);
        const note = {
          id: crypto.randomUUID(),
          repoId: INBOX_NOTEBOOK_ID,
          body: body.trim(),
          status: 'captured' as const,
          done: false,
          createdAt: at,
          updatedAt: at,
          order: existing.length > 0 ? Math.min(...existing.map((n) => n.order)) - 1 : 0,
        };
        await store.save(note);
        return { ok: true, target: 'inbox' as const, noteId: note.id };
      },
      (issue) => {
        warn(issue);
        return { ok: false, target: 'inbox' as const };
      },
    );
  },
});
