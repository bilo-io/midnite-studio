import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The renderer only. `base: './'` because the packaged launcher loads
 * `dist/renderer/index.html` over `file://`, where an absolute `/assets/…`
 * would resolve against the filesystem root.
 *
 * `@midnite/studio-shared/studio-link` is aliased to its one source file, the
 * same move `packages/website` makes for `install-command`: the package barrel
 * pulls every zod schema in the wire contract, and `studio-link.ts` imports
 * types only.
 */
export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  resolve: {
    alias: {
      '@midnite/studio-shared/studio-link': fileURLToPath(
        new URL('../../packages/shared/src/studio-link.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5175, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
  },
});
