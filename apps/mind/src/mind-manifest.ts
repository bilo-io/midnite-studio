import { notesManifest } from '@midnite/studio-feature-notes/renderer';

/**
 * Mind's app manifest — pure data (Phase 113 Theme M).
 *
 * `accent` matches the launcher catalog's `mind` tile; the glyph is the
 * catalog's too (`PiBrainFill`, rendered by the home view and baked into
 * `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`). `home` is the one view
 * Mind opens on.
 */
export const MIND_APP = {
  id: 'mind',
  name: 'Midnite Mind',
  tagline: 'Notes and spaced review',
  accent: '#0ea5e9',
  home: 'notes',
  features: [notesManifest.feature],
} as const;

export type MindApp = typeof MIND_APP;
