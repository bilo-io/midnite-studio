#!/usr/bin/env node
/**
 * Bundle Creator's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the media features' main halves, zod), so
 * the installed bundle carries no workspace symlinks. Run after `vite build`: that empties `dist/`.
 */
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'warning',
  minify: process.env.NODE_ENV === 'production',
  // The feature's `./main` export points at tsc output; bundle its source so no prior tsc build is needed.
  alias: {
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-report/bridge': at('../../../packages/features/report/bridge.ts'),
    '@midnite/studio-feature-media-core/main': at('../../../packages/features/media-core/main/index.ts'),
    '@midnite/studio-feature-media-docs/main': at('../../../packages/features/media-docs/main/index.ts'),
    '@midnite/studio-feature-media-images/main': at('../../../packages/features/media-images/main/index.ts'),
    '@midnite/studio-feature-media-video/main': at('../../../packages/features/media-video/main/index.ts'),
    '@midnite/studio-feature-media-audio/main': at('../../../packages/features/media-audio/main/index.ts'),
    // The Creator module's main half and bridge, from source (Phase 124 Theme C).
    '@midnite/studio-module-creator/main': at('../../../packages/modules/creator/main/index.ts'),
    '@midnite/studio-module-creator/bridge': at('../../../packages/modules/creator/main/bridge.ts'),
    // The channel names alone, by source path: the shared barrel drags every zod schema (~400 KB) into the preload.
    '@midnite/studio-shared/ipc/channels': at('../../../packages/shared/src/ipc/channels.ts'),
    // Likewise the bridge helper alone: the runtime barrel imports shared, which would pull the barrel back in.
    '@midnite/studio-runtime/app-main/bridge-slice': at('../../../packages/runtime/src/app-main/bridge-slice.ts'),
    '@midnite/studio-runtime/app-main/suite-preload': at('../../../packages/runtime/src/app-main/suite-preload.ts'),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [at('../main/index.ts')], outfile: at('../dist/main.cjs') }),
  build({ ...common, entryPoints: [at('../main/preload.ts')], outfile: at('../dist/preload.cjs') }),
]);

// Setup Video copies the engine workspace from `templates/media-video` (Remotion's and HyperFrames' editor apps,
// the project template, the editorial-script skills). It ships beside the bundle, where `main/index.ts` looks for it.
cpSync(at('../../../templates/media-video'), at('../dist/templates/media-video'), { recursive: true });
