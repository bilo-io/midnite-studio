#!/usr/bin/env node
/**
 * Bundle Capture's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the capture feature's main half, zod), so the
 * installed bundle carries no workspace symlinks. Run after `vite build`: that empties `dist/`.
 */
import { copyFileSync } from 'node:fs';
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
    '@midnite/studio-feature-capture/main': at('../../../packages/features/capture/main/index.ts'),
    // The channel names alone, by source path: the shared barrel drags every zod schema (~400 KB) into the preload.
    '@midnite/studio-shared/ipc/channels': at('../../../packages/shared/src/ipc/channels.ts'),
    // Likewise the bridge helper alone: the runtime barrel imports shared, which would pull the barrel back in.
    '@midnite/studio-runtime/app-main/bridge-slice': at(
      '../../../packages/runtime/src/app-main/bridge-slice.ts',
    ),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [at('../main/index.ts')], outfile: at('../dist/main.cjs') }),
  build({ ...common, entryPoints: [at('../main/preload.ts')], outfile: at('../dist/preload.cjs') }),
  // Phase 113 Theme K slice 2: the region overlay window's own preload (three calls, nothing else)…
  build({
    ...common,
    entryPoints: [at('../main/overlay-preload.ts')],
    outfile: at('../dist/overlay-preload.cjs'),
  }),
  // …and its page's script: the feature's tiny DOM entry, a classic iife for the browser.
  build({
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
    logLevel: 'warning',
    minify: process.env.NODE_ENV === 'production',
    entryPoints: [at('../../../packages/features/capture/renderer/overlay/entry.ts')],
    outfile: at('../dist/capture-overlay.js'),
  }),
]);
// The overlay's static page, with its own strict CSP, beside the script it loads.
copyFileSync(
  at('../../../packages/features/capture/renderer/overlay/capture-overlay.html'),
  at('../dist/capture-overlay.html'),
);
