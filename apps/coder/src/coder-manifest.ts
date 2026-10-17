import { apiClientManifest } from '@midnite/studio-feature-api-client/renderer';
import { databaseManifest } from '@midnite/studio-feature-database/renderer';
import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { sessionsManifest } from '@midnite/studio-feature-sessions/renderer';
import { tasksManifest } from '@midnite/studio-feature-tasks/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';

/**
 * Coder's app manifest — pure data (Phase 113 Theme O slices 1-4).
 *
 * `accent` matches the launcher catalog's `coder` tile; the glyph is the catalog's too (`LuCode`,
 * rendered by the home view and baked into `resources/icon.icns` by `scripts/make-icon.mjs`). `home`
 * is Reviews, with Actions, Tests, the Graph, the API client, the Database and Sessions beside it. The
 * Graph is the frame's own git graph (slice 2, `@midnite/studio-frame/graph`), read-only — so it is a
 * view, not a feature. Sessions (slice 4) lists the runtime host's terminal sessions as a broker guest.
 * Tasks (slice 5) is the forge's issues and project boards as a table, a board and a dependency graph.
 */
export const CODER_APP = {
  id: 'coder',
  name: 'Midnite Coder',
  tagline: 'Pull requests, checks and tests',
  accent: '#2e7cfa',
  home: 'reviews',
  features: [forgeManifest.feature, testsManifest.feature, apiClientManifest.feature, databaseManifest.feature, sessionsManifest.feature, tasksManifest.feature],
  views: ['reviews', 'actions', 'tasks', 'tests', 'graph', 'apiClient', 'database', 'sessions'],
} as const;

export type CoderAppManifest = typeof CODER_APP;
export type CoderViewId = (typeof CODER_APP.views)[number];
