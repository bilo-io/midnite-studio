#!/usr/bin/env node
/**
 * Bundle Gamer's main, preload and its two utility-process workers into `dist/`, beside the renderer
 * `vite build` wrote there — the bundle zip is `dist/` plus an icon and a package.json naming `main.cjs`.
 * Everything but `electron` is inlined (the runtime, the game features' main halves, zod), so the installed
 * bundle carries no workspace symlinks. Run after `vite build`: that empties `dist/`.
 */
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const feature = (name, entry) => at(`../../../packages/features/${name}/${entry}`);
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
    '@midnite/studio-module-creator/main': at('../../../packages/modules/creator/main/index.ts'),
    '@midnite/studio-module-creator/bridge': at('../../../packages/modules/creator/main/bridge.ts'),
    '@midnite/studio-feature-report/bridge': at('../../../packages/features/report/bridge.ts'),
    '@midnite/studio-feature-media-docs/main': at('../../../packages/features/media-docs/main/index.ts'),
    '@midnite/studio-feature-media-video/main': at('../../../packages/features/media-video/main/index.ts'),
    '@midnite/studio-feature-media-audio/main': at('../../../packages/features/media-audio/main/index.ts'),
    '@midnite/studio-module-gamer/bridge': at('../../../packages/modules/gamer/main/bridge.ts'),
    '@midnite/studio-module-gamer/main': at('../../../packages/modules/gamer/main/index.ts'),
    '@midnite/studio-feature-report/main': at('../../../packages/features/report/main/index.ts'),
    '@midnite/studio-feature-media-core/main': feature('media-core', 'main/index.ts'),
    '@midnite/studio-feature-media-map/main': feature('media-map', 'main/index.ts'),
    '@midnite/studio-feature-media-map/map-capture-worker': feature('media-map', 'main/map/worker-entry.ts'),
    '@midnite/studio-feature-media-terrain/main': feature('media-terrain', 'main/index.ts'),
    '@midnite/studio-feature-media-terrain/terrain-worker': feature('media-terrain', 'main/terrain/worker-entry.ts'),
    '@midnite/studio-feature-media-sprite/main': feature('media-sprite', 'main/index.ts'),
    '@midnite/studio-feature-media-game/main': feature('media-game', 'main/index.ts'),
    '@midnite/studio-feature-media-model/main': feature('media-model', 'main/index.ts'),
    // Used as libraries, never as tabs: the Images feature's providers behind Sprites' and Terrain's image
    // generation, and the Models feature's Ollama client behind the Model tab's engine.
    '@midnite/studio-feature-media-images/main': feature('media-images', 'main/index.ts'),
    '@midnite/studio-feature-models/main': feature('models', 'main/index.ts'),
    // The channel names alone, by source path: the shared barrel drags every zod schema (~400 KB) into the preload.
    '@midnite/studio-shared/ipc/channels': at('../../../packages/shared/src/ipc/channels.ts'),
    // Likewise the bridge helper alone: the runtime barrel imports shared, which would pull the barrel back in.
    '@midnite/studio-runtime/app-main/bridge-slice': at('../../../packages/runtime/src/app-main/bridge-slice.ts'),
    // The game-agent shim runs as plain node: the run-shim module alone, never the runtime barrel.
    '@midnite/studio-runtime/agent-run/run-shim': at('../../../packages/runtime/src/agent-run/run-shim.ts'),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [at('../main/index.ts')], outfile: at('../dist/main.cjs') }),
  build({ ...common, entryPoints: [at('../main/preload.ts')], outfile: at('../dist/preload.cjs') }),
  // The two `utilityProcess` entries the Maps and Terrain brokers fork, by the names their script-path helpers give.
  build({ ...common, entryPoints: [at('../../../packages/modules/gamer/main/workers/map-capture-worker.ts')], outfile: at('../dist/map-capture-worker.js') }),
  build({ ...common, entryPoints: [at('../../../packages/modules/gamer/main/workers/terrain-worker.ts')], outfile: at('../dist/terrain-worker.js') }),
  // A game agent run's stdio MCP shim, spawned by the agent CLI and run by Gamer's binary as plain node.
  // `.cjs`, not `.js`: this package is `"type": "module"`, and node reads a `.js` beside it as ESM.
  build({ ...common, entryPoints: [at('../../../packages/modules/gamer/main/workers/game-mcp-shim.ts')], outfile: at('../dist/game-mcp-shim.cjs') }),
]);

// New games start from `templates/media-game`; the vendored engines are copied into each game repo. Both ship
// beside the bundle, where `main/index.ts` looks for them. The engines are produced by
// `scripts/vendor-game-engines.mjs` (a copy from node_modules, no download) and are skipped when absent.
cpSync(at('../../../templates/media-game'), at('../dist/templates/media-game'), { recursive: true });
const engines = at('../../../packages/desktop/resources/game-engines');
if (existsSync(engines)) cpSync(engines, at('../dist/game-engines'), { recursive: true });
const materials = at('../../../packages/desktop/resources/terrain-materials');
if (existsSync(materials)) cpSync(materials, at('../dist/terrain-materials'), { recursive: true });

// The Creator module's Setup Video copies the engine workspace from `templates/media-video`; it ships beside the
// bundle, where `main/index.ts` looks for it.
cpSync(at('../../../templates/media-video'), at('../dist/templates/media-video'), { recursive: true });
