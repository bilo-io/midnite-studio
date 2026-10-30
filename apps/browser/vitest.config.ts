import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-module-browser/bridge': at('../../packages/modules/browser/main/bridge.ts'),
      '@midnite/studio-module-browser/main': at('../../packages/modules/browser/main/index.ts'),
      '@midnite/studio-module-browser/renderer': at('../../packages/modules/browser/renderer/index.ts'),
      // Subpaths before their barrels, or the barrel's alias would swallow them.
      '@midnite/studio-shared/ipc/channels': at('../../packages/shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../packages/runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-feature-report/main': at('../../packages/features/report/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../packages/features/report/bridge.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
      '@midnite/studio-feature-browser/main': at('../../packages/features/browser/main/index.ts'),
      '@midnite/studio-feature-browser/renderer': at('../../packages/features/browser/renderer/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
    // No test can act as the user on GitHub; and jsdom gets a ResizeObserver that fires.
    setupFiles: ['../../scripts/vitest-isolate-gh.mjs', '../../packages/frame/src/vitest-setup.ts'],
  },
});
