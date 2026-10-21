/**
 * The notes feature's internals, for tests that exercise it *as a composing
 * app wires it* — Studio's `packages/app/src/compose/notes/` suite renders
 * these under its real providers and mock bridge (Phase 113 Theme M).
 *
 * Not for production code: an app composes the feature through
 * `@midnite/studio-feature-notes/renderer` and nothing else.
 */
export { NoteRow } from './note-row';
export { NotesView } from './notes-view';
export { useNotesStore } from './notes-store';
export { createTestNotesHost } from './test-host';
export { NotesWorkspace } from './notes-workspace';
export { ReviewView } from './review-view';
