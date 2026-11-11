import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Startup module (Phase 130): a roadmap, a costs-and-runway model and a lightweight ERP. Its code lives in
 * the module itself rather than a feature package (nothing else composes it), so `features` and `views` are
 * empty. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const startupManifest = defineModuleManifest({
  module: 'startup',
  label: 'Startup',
  glyph: 'PiBuildingsFill',
  accent: '#8b5cf6',
  features: [],
  views: [],
});

export type StartupManifest = typeof startupManifest;
