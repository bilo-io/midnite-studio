#!/usr/bin/env node
/**
 * Bundle Agents's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` is inlined (the runtime, the main halves of the three modules and their features, zod), so
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
  external: ['electron', 'better-sqlite3'],
  logLevel: 'warning',
  minify: process.env.NODE_ENV === 'production',
  // The feature's `./main` export points at tsc output; bundle its source so no prior tsc build is needed.
  alias: {
    '@midnite/studio-module-coder/main': at('../../../packages/modules/coder/main/index.ts'),
    '@midnite/studio-module-coder/bridge': at('../../../packages/modules/coder/main/bridge.ts'),
    '@midnite/studio-module-creator/main': at('../../../packages/modules/creator/main/index.ts'),
    '@midnite/studio-module-creator/bridge': at('../../../packages/modules/creator/main/bridge.ts'),
    '@midnite/studio-db-engine': at('../../../packages/db-engine/src/index.ts'),
    '@midnite/studio-feature-api-client/script-runner-worker': at('../../../packages/features/api-client/main/script-runner-worker.ts'),
    '@midnite/studio-feature-forge/main': at('../../../packages/features/forge/main/index.ts'),
    '@midnite/studio-feature-tests/main': at('../../../packages/features/tests/main/index.ts'),
    '@midnite/studio-feature-api-client/main': at('../../../packages/features/api-client/main/index.ts'),
    '@midnite/studio-feature-database/main': at('../../../packages/features/database/main/index.ts'),
    '@midnite/studio-feature-sessions/main': at('../../../packages/features/sessions/main/index.ts'),
    '@midnite/studio-feature-media-core/main': at('../../../packages/features/media-core/main/index.ts'),
    '@midnite/studio-feature-media-docs/main': at('../../../packages/features/media-docs/main/index.ts'),
    '@midnite/studio-feature-media-images/main': at('../../../packages/features/media-images/main/index.ts'),
    '@midnite/studio-feature-media-video/main': at('../../../packages/features/media-video/main/index.ts'),
    '@midnite/studio-feature-media-audio/main': at('../../../packages/features/media-audio/main/index.ts'),
    '@midnite/studio-module-agents/bridge': at('../../../packages/modules/agents/main/bridge.ts'),
    '@midnite/studio-module-agents/main': at('../../../packages/modules/agents/main/index.ts'),
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-report/bridge': at('../../../packages/features/report/bridge.ts'),
    '@midnite/studio-feature-chats/main': at('../../../packages/features/chats/main/index.ts'),
    '@midnite/studio-feature-councils/main': at('../../../packages/features/councils/main/index.ts'),
    '@midnite/studio-feature-models/main': at('../../../packages/features/models/main/index.ts'),
    '@midnite/studio-feature-workflows/main': at('../../../packages/features/workflows/main/index.ts'),
    '@midnite/studio-feature-mcp-tools/main': at('../../../packages/features/mcp-tools/main/index.ts'),
    // git-engine from source, with `dugite` swapped for the system git behind dugite's own API (Phase 124 Theme E.3):
    // the Coder module this host mounts only ever reads, and Agents bundles no 42 MB git of its own. See the
    // Coder module's main/system-git.ts and docs/APPS.md.
    '@midnite/studio-git-engine': at('../../../packages/git-engine/src/index.ts'),
    dugite: at('../../../packages/modules/coder/main/system-git.ts'),
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
  // The Coder module's API-client script runner is its own OS process (`utilityProcess`): a fork target must be
  // a single module on disk, so it is bundled on its own.
  build({ ...common, entryPoints: [at('../../../packages/modules/coder/main/script-runner-worker.ts')], outfile: at('../dist/script-runner-worker.cjs') }),
]);

// The Creator module's Setup Video copies the engine workspace from `templates/media-video`; it ships beside the
// bundle, where `main/index.ts` looks for it.
cpSync(at('../../../templates/media-video'), at('../dist/templates/media-video'), { recursive: true });
