import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../packages/shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../packages/runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame/knowledge': at('../../packages/frame/src/knowledge/index.ts'),
      '@midnite/studio-knowledge': at('../../packages/knowledge/src/index.ts'),
      '@midnite/studio-feature-report/main': at('../../packages/features/report/main/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
      '@midnite/studio-feature-notes/main': at('../../packages/features/notes/main/index.ts'),
      '@midnite/studio-feature-notes/renderer': at('../../packages/features/notes/renderer/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
  },
});
