/**
 * Midnite Studio as a composition (Phase 113 Theme G).
 *
 * Studio is the suite's superset: every feature package plus the frame. It is
 * the dev harness (`moon run studio:start`) and stays installable for power
 * users. This file is the one declaration of *what* it composes; the *how*
 * stays where it already lives — `packages/app` is the renderer
 * (`src/compose/` wires each feature in) and `packages/desktop` the Electron
 * main — and those two are now this app's internals, not separate entry points.
 *
 * Imports no workspace package: it is data the composition test holds against
 * `packages/features/*` so a newly extracted feature cannot be forgotten here.
 */

/** Feature packages (`packages/features/<name>`) Studio composes. */
export const STUDIO_FEATURES = ['optimizer', 'monitor', 'vault', 'notes', 'finance', 'media-core'] as const;

export const STUDIO_COMPOSITION = {
  id: 'studio',
  /** The renderer internals: `packages/app`. */
  renderer: '@midnite/studio-app',
  /** The Electron main + preload internals: `packages/desktop`. */
  main: '@midnite/studio-desktop',
  features: STUDIO_FEATURES,
} as const;
