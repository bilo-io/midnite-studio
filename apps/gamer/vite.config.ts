import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const renderer = (name: string) => at(`../../packages/features/${name}/renderer/index.ts`);

// `root` is src/, so PostCSS would look for its config there; point it at the app root.
export default defineConfig({
  plugins: [react()],
  root: at('./src'),
  base: './',
  css: { postcss: at('./') },
  resolve: {
    // One React and React Query across the features, whose copies are peers.
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-media-core/renderer': renderer('media-core'),
      '@midnite/studio-feature-media-map/renderer': renderer('media-map'),
      '@midnite/studio-feature-media-terrain/renderer': renderer('media-terrain'),
      '@midnite/studio-feature-media-sprite/renderer': renderer('media-sprite'),
      '@midnite/studio-feature-media-game/renderer': renderer('media-game'),
    },
  },
  server: { port: 5183, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
