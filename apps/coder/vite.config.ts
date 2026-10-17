import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// `root` is src/, so PostCSS would look for its config there; point it at the app root.
export default defineConfig({
  plugins: [react()],
  root: at('./src'),
  base: './',
  css: { postcss: at('./') },
  resolve: {
    alias: {
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      // The frame's own entries before its barrel, or the barrel's alias would swallow the subpath.
      '@midnite/studio-frame/graph': at('../../packages/frame/src/graph/index.ts'),
      '@midnite/studio-frame/diff': at('../../packages/frame/src/diff/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-api-client/renderer': at('../../packages/features/api-client/renderer/index.ts'),
      '@midnite/studio-feature-database/renderer': at('../../packages/features/database/renderer/index.ts'),
      '@midnite/studio-feature-forge/renderer': at('../../packages/features/forge/renderer/index.ts'),
      '@midnite/studio-feature-tests/renderer': at('../../packages/features/tests/renderer/index.ts'),
    },
  },
  server: { port: 5191, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
