import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Media module (Phase 124 Theme E): the media host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const mediaManifest = defineModuleManifest({
  module: 'media',
  label: 'Media',
  glyph: 'PiMonitorPlayFill',
  accent: '#facc15',
  features: ['media'],
  views: [
    { id: 'media', global: false }
  ],
});

export type MediaManifest = typeof mediaManifest;
