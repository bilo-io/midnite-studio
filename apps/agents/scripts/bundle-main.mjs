#!/usr/bin/env node
/**
 * Bundle Agents's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the three features' main halves, zod), so
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
    '@midnite/studio-feature-chats/main': at('../../../packages/features/chats/main/index.ts'),
    '@midnite/studio-feature-councils/main': at('../../../packages/features/councils/main/index.ts'),
    '@midnite/studio-feature-models/main': at('../../../packages/features/models/main/index.ts'),
    // git-engine from source, with `dugite` (a native git) stubbed: Agents has no repository registry, so
    // chats run in scratch directories and nothing here ever reaches git. See main/dugite-stub.ts.
    '@midnite/studio-git-engine': at('../../../packages/git-engine/src/index.ts'),
    dugite: at('../main/dugite-stub.ts'),
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
