import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../shared/src/index.ts'),
      '@midnite/studio-frame': at('../../frame/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../features/report/renderer/index.ts'),
      '@midnite/studio-feature-report/main': at('../../features/report/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../features/report/bridge.ts'),
      '@midnite/studio-runtime': at('../../runtime/src/index.ts'),
      '@midnite/studio-git-engine': at('../../git-engine/src/index.ts'),
      '@midnite/studio-feature-optimizer/main': at('../../features/optimizer/main/index.ts'),
      '@midnite/studio-feature-optimizer/renderer/testing': at('../../features/optimizer/renderer/testing.ts'),
      '@midnite/studio-feature-optimizer/renderer': at('../../features/optimizer/renderer/index.ts'),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
  },
});
