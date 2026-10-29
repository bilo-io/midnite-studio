import { defineModuleManifest } from '@midnite/studio-shared';

/** Coder's views in tab order; Reviews is the one it opens on. */
export const CODER_VIEWS = ['reviews', 'actions', 'tasks', 'tests', 'graph', 'apiClient', 'database', 'sessions'] as const;
export type CoderViewId = (typeof CODER_VIEWS)[number];
export const CODER_HOME = 'reviews' satisfies CoderViewId;

/**
 * The Coder module (Phase 124 Theme C): pull requests and reviews, CI runs, a repository's tests, its API
 * collections, its databases and the runtime host's sessions, over the forge, tests, API client, database,
 * sessions and tasks features and the frame's read-only graph. Pure data both halves read: it imports
 * `@midnite/studio-shared` and nothing else. The Database tool and Sessions are global (no repository needed).
 */
export const coderManifest = defineModuleManifest({
  module: 'coder',
  label: 'Coder',
  glyph: 'LuCode',
  accent: '#2e7cfa',
  features: ['forge', 'tests', 'api-client', 'database', 'sessions', 'tasks'],
  views: CODER_VIEWS.map((id) => ({ id, global: id === 'database' || id === 'sessions' })),
});

export type CoderManifest = typeof coderManifest;
