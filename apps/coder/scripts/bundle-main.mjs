#!/usr/bin/env node
/**
 * Bundle Coder's main + preload into `dist/main.cjs` and `dist/preload.cjs`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming
 * `main.cjs`. Everything but `electron` (and `better-sqlite3`, below) is inlined (the runtime, the
 * forge, tests, API client and Database features' main halves, the database engine's drivers, zod), so
 * the installed bundle carries no workspace symlinks. Run after `vite build`: that empties `dist/`.
 *
 * A third entry, `dist/script-runner-worker.cjs`, is the `utilityProcess` the API client's script broker
 * forks — its own OS process, so a hostile or wedged user script is killed without touching main. It is
 * the feature's worker unchanged (the `vm` sandbox lives there), bundled on its own because a fork target
 * must be a single module on disk.
 *
 * **`better-sqlite3` stays external and is not shipped**: it is a native module, and the bundle format has
 * no machinery to carry a prebuilt `.node` per Electron ABI. The SQLite driver loads it lazily, so a SQLite
 * connection in Coder answers "Failed to load better-sqlite3" while Postgres, MySQL, MariaDB and MSSQL
 * (pure JS) work (docs/APPS.md, "Coder slice 3").
 */
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
  // The features' `./main` exports point at tsc output; bundle their source so no prior tsc build is needed.
  alias: {
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-report/bridge': at('../../../packages/features/report/bridge.ts'),
    '@midnite/studio-feature-forge/main': at('../../../packages/features/forge/main/index.ts'),
    '@midnite/studio-feature-api-client/main': at('../../../packages/features/api-client/main/index.ts'),
    '@midnite/studio-feature-api-client/script-runner-worker': at('../../../packages/features/api-client/main/script-runner-worker.ts'),
    '@midnite/studio-feature-database/main': at('../../../packages/features/database/main/index.ts'),
    // The engine from source too, so no prior tsc build is needed (its drivers are pure JS but sqlite).
    '@midnite/studio-db-engine': at('../../../packages/db-engine/src/index.ts'),
    '@midnite/studio-feature-tests/main': at('../../../packages/features/tests/main/index.ts'),
    '@midnite/studio-feature-sessions/main': at('../../../packages/features/sessions/main/index.ts'),
    // git-engine from source, with `dugite` swapped for the system git behind dugite's own API: Coder
    // bundles no 42 MB git of its own, and only ever reads. See the module's main/system-git.ts and docs/APPS.md.
    '@midnite/studio-git-engine': at('../../../packages/git-engine/src/index.ts'),
    dugite: at('../../../packages/modules/coder/main/system-git.ts'),
    // The Coder module's main half and bridge, from source (Phase 124 Theme C).
    '@midnite/studio-module-coder/main': at('../../../packages/modules/coder/main/index.ts'),
    '@midnite/studio-module-coder/bridge': at('../../../packages/modules/coder/main/bridge.ts'),
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
  // The script worker needs no git shim and no channel names: it is the sandbox and a message loop.
  build({ ...common, entryPoints: [at('../../../packages/modules/coder/main/script-runner-worker.ts')], outfile: at('../dist/script-runner-worker.cjs') }),
]);
