import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Science module (Phase 126 Theme A): notebooks of prose, maths, plots and molecules. Pure data both
 * halves read: it imports `@midnite/studio-shared` and nothing else. `features` and `views` are empty because
 * the code lives in the module and the host's rail ids are host-local strings, not Studio `ViewId`s.
 */
export const scienceManifest = defineModuleManifest({
  module: 'science',
  label: 'Science',
  glyph: 'PiFlaskFill',
  accent: '#06b6d4',
  features: [],
  views: [],
});

export type ScienceManifest = typeof scienceManifest;
