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
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-chats/renderer': at('../../packages/features/chats/renderer/index.ts'),
      '@midnite/studio-feature-councils/renderer': at('../../packages/features/councils/renderer/index.ts'),
      '@midnite/studio-feature-models/renderer': at('../../packages/features/models/renderer/index.ts'),
    },
  },
  server: { port: 5190, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
