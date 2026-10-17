import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';

/**
 * Coder's app manifest — pure data (Phase 113 Theme O slice 1).
 *
 * `accent` matches the launcher catalog's `coder` tile; the glyph is the catalog's too (`LuCode`,
 * rendered by the home view and baked into `resources/icon.icns` by `scripts/make-icon.mjs`). `home`
 * is Reviews, with Actions and Tests beside it. The git graph, sessions, tasks, the API client and
 * the database are the catalog's other features and land in later slices.
 */
export const CODER_APP = {
  id: 'coder',
  name: 'Midnite Coder',
  tagline: 'Pull requests, checks and tests',
  accent: '#2e7cfa',
  home: 'reviews',
  features: [forgeManifest.feature, testsManifest.feature],
  views: ['reviews', 'actions', 'tests'],
} as const;

export type CoderAppManifest = typeof CODER_APP;
export type CoderViewId = (typeof CODER_APP.views)[number];
