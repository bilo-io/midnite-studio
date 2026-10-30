#!/usr/bin/env node
/**
 * Bundle Vanguard's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the main halves of the Vanguard host's four modules and their features, zod), so
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
    '@midnite/studio-module-vanguard/bridge': at('../../../packages/modules/vanguard/main/bridge.ts'),
    '@midnite/studio-module-vanguard/main': at('../../../packages/modules/vanguard/main/index.ts'),
    '@midnite/studio-module-vault/bridge': at('../../../packages/modules/vault/main/bridge.ts'),
    '@midnite/studio-module-vault/main': at('../../../packages/modules/vault/main/index.ts'),
    '@midnite/studio-module-cleaner/bridge': at('../../../packages/modules/cleaner/main/bridge.ts'),
    '@midnite/studio-module-cleaner/main': at('../../../packages/modules/cleaner/main/index.ts'),
    '@midnite/studio-module-monitor/bridge': at('../../../packages/modules/monitor/main/bridge.ts'),
    '@midnite/studio-module-monitor/main': at('../../../packages/modules/monitor/main/index.ts'),
    '@midnite/studio-feature-vault/main': at('../../../packages/features/vault/main/index.ts'),
    '@midnite/studio-feature-optimizer/main': at('../../../packages/features/optimizer/main/index.ts'),
    '@midnite/studio-feature-monitor/main': at('../../../packages/features/monitor/main/index.ts'),
    '@midnite/studio-feature-report/bridge': at('../../../packages/features/report/bridge.ts'),
    '@midnite/studio-git-engine': at('../../../packages/git-engine/src/index.ts'),
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-vanguard/main': at('../../../packages/features/vanguard/main/index.ts'),
    '@midnite/studio-feature-sessions/main': at('../../../packages/features/sessions/main/index.ts'),
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
