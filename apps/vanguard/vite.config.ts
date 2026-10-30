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
      '@midnite/studio-module-vanguard/renderer': at('../../packages/modules/vanguard/renderer/index.ts'),
      '@midnite/studio-module-vault/renderer': at('../../packages/modules/vault/renderer/index.ts'),
      '@midnite/studio-module-cleaner/renderer': at('../../packages/modules/cleaner/renderer/index.ts'),
      '@midnite/studio-module-monitor/renderer': at('../../packages/modules/monitor/renderer/index.ts'),
      '@midnite/studio-feature-vault/renderer': at('../../packages/features/vault/renderer/index.ts'),
      '@midnite/studio-feature-optimizer/renderer': at('../../packages/features/optimizer/renderer/index.ts'),
      '@midnite/studio-feature-monitor/renderer': at('../../packages/features/monitor/renderer/index.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-vanguard/renderer': at('../../packages/features/vanguard/renderer/index.ts'),
    },
  },
  server: { port: 5192, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
