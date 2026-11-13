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
      '@midnite/studio-module-science/renderer': at('../../packages/modules/science/renderer/index.ts'),
      '@midnite/studio-module-simulator/renderer': at('../../packages/modules/simulator/renderer/index.ts'),
      '@midnite/studio-feature-monitor/renderer': at('../../packages/features/monitor/renderer/index.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
    },
  },
  server: { port: 5194, strictPort: true },
  // A packaged renderer loads from file://, so a worker is imported with `?worker&inline` (see packages/app/vite.config.ts).
  worker: { format: 'es' },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
