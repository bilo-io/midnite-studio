import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('./src', import.meta.url)),
  base: './',
  resolve: {
    alias: {
      '@midnite/studio-shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@midnite/studio-frame': fileURLToPath(new URL('../../packages/frame/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5176, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
});
