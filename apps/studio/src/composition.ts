/**
 * Midnite Studio as a composition (Phase 113 Theme G).
 *
 * Studio is the suite's superset: every feature package plus the frame. It is
 * the dev harness (`moon run studio:start`) and stays installable for power
 * users. This file is the one declaration of *what* it composes; the *how*
 * stays where it already lives — `packages/app` is the renderer
 * (`src/compose/` wires each feature in) and `packages/desktop` the Electron
 * main — and those two are this app's internals, not entry points of their own.
 *
 * Studio's entries are this app's: `entry/renderer.ts` is what `index.html`
 * loads and `entry/main.ts` is what `dist/bundle/main.js` is built from. Each
 * hands over to its internal through one seam (`@midnite/studio-app/boot`,
 * `@midnite/studio-desktop/main`). The page, the Vite config, the esbuild script
 * and electron-builder's config stay in the internals, where the packaged app,
 * the perf scripts and the e2e harness read them.
 *
 * Imports no workspace package: it is data the composition test holds against
 * `packages/features/*` and the two builds, so a newly extracted feature cannot
 * be forgotten here and neither build can stop booting these entries unnoticed.
 */

/** Feature packages (`packages/features/<name>`) Studio composes. */
export const STUDIO_FEATURES = ['optimizer', 'monitor', 'vault', 'notes', 'finance', 'media-core', 'media-docs', 'media-images', 'media-library', 'models', 'councils', 'chats', 'media-audio', 'media-video', 'slides', 'workflows', 'mcp-tools', 'tests', 'forge', 'media-map', 'media-terrain', 'media-sprite', 'media-model', 'media-game', 'api-client', 'database', 'sessions', 'tasks', 'browser', 'capture'] as const;

export const STUDIO_COMPOSITION = {
  id: 'studio',
  /** The renderer internals: `packages/app`. */
  renderer: '@midnite/studio-app',
  /** The Electron main + preload internals: `packages/desktop`. */
  main: '@midnite/studio-desktop',
  /** Studio's entries, relative to this app: what the renderer and the main process boot. */
  entries: { renderer: 'entry/renderer.ts', main: 'entry/main.ts' },
  features: STUDIO_FEATURES,
} as const;
