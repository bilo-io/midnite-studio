import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
  },
});
