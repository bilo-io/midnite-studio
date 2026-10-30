import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Mind module (Phase 124 Theme E): the mind host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const mindManifest = defineModuleManifest({
  module: 'mind',
  label: 'Mind',
  glyph: 'PiBrainFill',
  accent: '#0ea5e9',
  features: ['notes', 'knowledge'],
  views: [
    { id: 'notes', global: false },
    { id: 'knowledge', global: false },
  ],
});

export type MindManifest = typeof mindManifest;
