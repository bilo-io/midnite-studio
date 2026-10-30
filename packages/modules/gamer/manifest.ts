import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The one "repository" Gamer's media is scoped to. The renderer's media store addresses everything by
 * `repoId`; Gamer has no repository list, so it has one id that main resolves to its own media root
 * (`<userData>/media`, holding `.midnite/media/<tab>/`). Both halves read it here so they cannot drift.
 */
export const GAMER_REPO_ID = 'gamer';

/**
 * The Gamer module (Phase 124 Theme E): the gamer host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const gamerManifest = defineModuleManifest({
  module: 'gamer',
  label: 'Gamer',
  glyph: 'PiGameControllerFill',
  accent: '#10b981',
  features: ['media'],
  views: [
    { id: 'media', global: false },
  ],
});

export type GamerManifest = typeof gamerManifest;
