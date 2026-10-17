#!/usr/bin/env node
/**
 * Bundle Coder's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the forge and tests features' main
 * halves, zod), so the installed bundle carries no workspace symlinks. Run after `vite build`: that
 * empties `dist/`.
 */
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
  // The features' `./main` exports point at tsc output; bundle their source so no prior tsc build is needed.
  alias: {
    '@midnite/studio-feature-forge/main': at('../../../packages/features/forge/main/index.ts'),
    '@midnite/studio-feature-tests/main': at('../../../packages/features/tests/main/index.ts'),
    // git-engine from source, with `dugite` swapped for the system git behind dugite's own API: Coder
    // bundles no 42 MB git of its own, and only ever reads. See main/system-git.ts and docs/APPS.md.
    '@midnite/studio-git-engine': at('../../../packages/git-engine/src/index.ts'),
    dugite: at('../main/system-git.ts'),
    // The channel names alone, by source path: the shared barrel drags every zod schema (~400 KB) into the preload.
    '@midnite/studio-shared/ipc/channels': at('../../../packages/shared/src/ipc/channels.ts'),
    // Likewise the bridge helper alone: the runtime barrel imports shared, which would pull the barrel back in.
    '@midnite/studio-runtime/app-main/bridge-slice': at('../../../packages/runtime/src/app-main/bridge-slice.ts'),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [at('../main/index.ts')], outfile: at('../dist/main.cjs') }),
  build({ ...common, entryPoints: [at('../main/preload.ts')], outfile: at('../dist/preload.cjs') }),
]);
