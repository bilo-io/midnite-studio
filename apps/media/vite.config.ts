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
    // One React and one React Query across the features, whose copies are peers.
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-media-core/renderer': at('../../packages/features/media-core/renderer/index.ts'),
      '@midnite/studio-feature-media-library/renderer': at('../../packages/features/media-library/renderer/index.ts'),
    },
  },
  server: { port: 5186, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
