import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';
import { z } from 'zod';

import { notesManifest } from '../manifest';
import type { NotesStore } from './notes-store';

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
  },
});
