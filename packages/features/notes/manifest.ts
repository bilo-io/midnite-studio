import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The notes feature — Mind's first feature (Phase 113 Theme M), copying the
 * monitor's template (`../monitor/manifest.ts`).
 *
 * Notes are captured against a repository id and kept on disk by main
 * (`userData/notes/<repoId>.json`); the renderer keeps a hydrated copy in a
 * zustand store and writes through `notes.save`/`delete`/`reorder`. Nothing
 * about that storage moved when the feature did.
 *
 * `settingsPages` is empty: Notes has none. The quick-access Notes panel (a
 * modal) stays Studio's — it is quick-access chrome, not this feature.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const notesManifest = defineFeatureManifest({
  feature: 'notes',
  owner: 'mind',
  views: [
    {
      id: 'notes',
      // Global: the rail row is pinned under Dashboard and greys out with no repo.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Notes',
        description: 'Markdown notes, kept per repository or globally',
      },
    },
  ],
  settingsPages: [],
  ipc: [CHANNELS.notesList, CHANNELS.notesSave, CHANNELS.notesDelete, CHANNELS.notesReorder],
  events: [],
  mcpTools: [],
});

export type NotesManifest = typeof notesManifest;
