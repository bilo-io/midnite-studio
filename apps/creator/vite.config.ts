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
      '@midnite/studio-module-creator/renderer': at('../../packages/modules/creator/renderer/index.ts'),
      '@midnite/studio-module-creator/manifest': at('../../packages/modules/creator/manifest.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-feature-media-core/renderer': at('../../packages/features/media-core/renderer/index.ts'),
      '@midnite/studio-feature-media-docs/renderer': at('../../packages/features/media-docs/renderer/index.ts'),
      '@midnite/studio-feature-media-images/renderer': at('../../packages/features/media-images/renderer/index.ts'),
      '@midnite/studio-feature-slides/renderer/modal': at('../../packages/features/slides/renderer/modal.ts'),
      '@midnite/studio-feature-slides/renderer': at('../../packages/features/slides/renderer/index.ts'),
      '@midnite/studio-feature-media-video/renderer': at('../../packages/features/media-video/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/renderer': at('../../packages/features/media-audio/renderer/index.ts'),
    },
  },
  server: { port: 5182, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
