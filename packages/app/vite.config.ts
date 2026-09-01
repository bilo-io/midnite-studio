import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

/**
 * Phase 36 Theme A: the chunk graph, on demand.
 *
 * `MSTUDIO_BUNDLE_STATS=1 moon run app:build` writes `dist/stats.html` — the
 * treemap that decides whether a `manualChunks` split is real duplication or
 * taste. Off by default: it costs build time and an artifact nobody wants in a
 * normal build, and the numbers `scripts/perf/bundle-report.mjs` prints come
 * from the emitted files themselves, not from this.
 */
const bundleStats = process.env['MSTUDIO_BUNDLE_STATS'] === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(bundleStats
      ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
      : []),
  ],
  // Relative asset URLs: production loads index.html off disk via file://, where
  // an absolute `/assets/...` would resolve to the filesystem root.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * Resolve the wire contract to its SOURCE, not its build output.
       *
       * `packages/shared` emits CommonJS because the Electron main process
       * `require()`s it, and require() of an ESM build throws. But Rollup
       * cannot statically see named exports through that CJS interop, so the
       * first time the renderer imported a *value* rather than a type
       * (`DEFAULT_KEYMAP`) the production build failed with "not exported by
       * ../shared/dist/index.js" — while `vite dev` was perfectly happy, since
       * esbuild's interop is more forgiving. A dev/prod split like that is the
       * worst kind to discover late.
       *
       * The renderer is bundled anyway, so compiling the TypeScript directly is
       * strictly better: real ESM, tree-shaking, and no way to build against a
       * stale dist. `shared` is zod-only, so nothing here reaches for Node.
       */
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },


  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    /**
     * `.vite/manifest.json` — the entry→chunk map.
     *
     * Written so a perf script or an e2e spec can ask "which file is the entry
     * chunk, and what does it import" instead of globbing `assets/index-*.js`
     * and hoping the hash pattern holds. `bundle-report.mjs` reads it; Theme C's
     * entry-chunk absence assertions will read it too.
     */
    manifest: true,
  },
});
