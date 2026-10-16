import type { ComponentType } from 'react';

import type { NotesManifest } from '../manifest';

/**
 * The notes feature's renderer half (Phase 113 Theme M). Needs the frame
 * (bridge, chrome port, lists, panes) and its own {@link NotesHost} for what
 * differs per app: which repositories exist, the editor, the markdown
 * renderer and whether notes can be handed to an agent.
 *
 * `sideEffects: false` keeps an app that imports only `notesViews` from
 * pulling the store into its entry chunk.
 */
export { notesManifest, type NotesManifest } from '../manifest';
export {
  NotesHostProvider,
  useNotesHost,
  type NoteHandoff,
  type NotesEditorProps,
  type NotesHost,
  type NotesListWidth,
} from './host';
export {
  applyNotesDelta,
  diffNotes,
  migrateNotesFromLocalStorage,
  migrateV1ToV2,
  NOTES_PERSIST_KEY,
  NoteSchema,
  notesForRepo,
  seedOrder,
  useNotesStore,
  type MigrationStorage,
  type Note,
  type NoteStatus,
  type NotesDelta,
  type NotesState,
} from './notes-store';
export { NoteRow, NEXT_STATUS, STATUS_CLASSES } from './note-row';
export { spliceVisibleOrder } from './notes-reorder';

type ViewIds = NotesManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const notesViews = {
  notes: () => import('./notes-view').then((m) => m.NotesView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
