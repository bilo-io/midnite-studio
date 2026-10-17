import { apiClientManifest } from '@midnite/studio-feature-api-client/renderer';
import { databaseManifest } from '@midnite/studio-feature-database/renderer';
import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';

/**
 * Coder's app manifest — pure data (Phase 113 Theme O slices 1-3).
 *
 * `accent` matches the launcher catalog's `coder` tile; the glyph is the catalog's too (`LuCode`,
 * rendered by the home view and baked into `resources/icon.icns` by `scripts/make-icon.mjs`). `home`
 * is Reviews, with Actions, Tests, the Graph, the API client and the Database beside it. The Graph is the
 * frame's own git graph (slice 2, `@midnite/studio-frame/graph`), read-only — so it is a view, not a
 * feature. Sessions and tasks are the catalog's other features and land in a later slice.
 */
export const CODER_APP = {
  id: 'coder',
  name: 'Midnite Coder',
  tagline: 'Pull requests, checks and tests',
  accent: '#2e7cfa',
  home: 'reviews',
  features: [forgeManifest.feature, testsManifest.feature, apiClientManifest.feature, databaseManifest.feature],
  views: ['reviews', 'actions', 'tests', 'graph', 'apiClient', 'database'],
} as const;

export type CoderAppManifest = typeof CODER_APP;
export type CoderViewId = (typeof CODER_APP.views)[number];
