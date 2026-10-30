#!/usr/bin/env node
/**
 * Bundle Money's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the finance feature's main half, zod), so
 * the installed bundle carries no workspace symlinks. Run after `vite build`: that empties `dist/`.
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
  // The feature's `./main` export points at tsc output; bundle its source so no prior tsc build is needed.
  alias: {
    '@midnite/studio-module-money/bridge': at('../../../packages/modules/money/main/bridge.ts'),
    '@midnite/studio-module-money/main': at('../../../packages/modules/money/main/index.ts'),
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-finance/main': at('../../../packages/features/finance/main/index.ts'),
    // The channel names alone, by source path: the shared barrel drags every zod schema (~400 KB) into the preload.
    '@midnite/studio-shared/ipc/channels': at('../../../packages/shared/src/ipc/channels.ts'),
    // Likewise the bridge helper alone: the runtime barrel imports shared, which would pull the barrel back in.
    '@midnite/studio-runtime/app-main/bridge-slice': at('../../../packages/runtime/src/app-main/bridge-slice.ts'),
    '@midnite/studio-runtime/app-main/suite-preload': at('../../../packages/runtime/src/app-main/suite-preload.ts'),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [at('../main/index.ts')], outfile: at('../dist/main.cjs') }),
  build({
    ...common,
    // The preload reads channel names only; the barrel would add every zod schema (the runtime's preload slices import it).
    alias: { ...common.alias, '@midnite/studio-shared': at('../../../packages/shared/src/ipc/channels.ts') },
    entryPoints: [at('../main/preload.ts')],
    outfile: at('../dist/preload.cjs'),
  }),
]);
