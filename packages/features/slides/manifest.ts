import { defineFeatureManifest } from '@midnite/studio-shared';

/**
 * Slides as a feature (Phase 113 Theme Q) — present any markdown as a deck:
 * a fullscreen overlay with a typewriter title and a step-by-step reveal, and
 * the one "Present as slides" button every markdown surface shares.
 *
 * Placed with Creator (`FEATURE_PLACEMENT.slides`) and composed by Studio too,
 * where the button sits on Files, PRs, issues and release notes. It is a
 * renderer-only feature: no view of its own (the deck opens over whatever is
 * showing, from a store), no settings page and no main half — a deck is a
 * viewer over text the app hands it, so there is no channel to register.
 *
 * Imports `@midnite/studio-shared` and nothing else — the same rule every
 * feature manifest keeps.
 */
export const slidesManifest = defineFeatureManifest({
  feature: 'slides',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [],
  events: [],
  mcpTools: [],
});

export type SlidesManifest = typeof slidesManifest;
