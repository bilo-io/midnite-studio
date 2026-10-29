import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Browser module (Phase 124 Theme E): the browser host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const browserManifest = defineModuleManifest({
  module: 'browser',
  label: 'Browser',
  glyph: 'PiGlobeFill',
  accent: '#f59e0b',
  features: ['browser'],
  views: [],
});

export type BrowserManifest = typeof browserManifest;
