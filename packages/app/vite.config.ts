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
  /**
   * The repo's first `worker` config — Phase 64 Theme A, Monaco's five
   * language workers (`lib/monaco/monaco-loader.ts`).
   *
   * Each is imported with the `?worker&inline` query, not plain `?worker`:
   * `main/window.ts`'s `win.loadFile(rendererEntry())` gives the packaged
   * renderer an opaque `file://` origin, and a `new Worker(new URL(...))`
   * pointing at a `file:` URL is blocked there — Chromium refuses to
   * construct a worker from an opaque-origin document. `&inline` makes Vite
   * emit the worker as a blob/data URL instead, which is not subject to that
   * restriction. Precedent: Shiki's WASM already ships inlined into a JS
   * chunk for the exact same reason (see `lib/highlighter.ts`'s doc comment).
   *
   * `format: 'es'` because Monaco's worker entry files are themselves ES
   * modules (`monaco-editor/esm/vs/...worker`) — a classic/IIFE worker cannot
   * `import`, so `?worker&inline` needs this to bundle them correctly.
   */
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /**
     * Opt-in, via `MSTUDIO_SOURCEMAP=1` (Phase 36 Theme C).
     *
     * `dist/` was 70 MB, ~54 MB of it renderer maps — paid on every build, in
     * every packaged artifact, and read only when someone is genuinely debugging
     * a production build. Now that is a deliberate rebuild with the flag set.
     * `packages/desktop/scripts/bundle.mjs` reads the same variable, so one
     * switch covers both halves of the app. The dev server is unaffected: it
     * serves its own inline maps and never consults `build`.
     */
    sourcemap: process.env['MSTUDIO_SOURCEMAP'] === '1',
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
