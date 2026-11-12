import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-feature-report/bridge': at('../../packages/features/report/bridge.ts'),
      '@midnite/studio-module-science/bridge': at('../../packages/modules/science/main/bridge.ts'),
      '@midnite/studio-module-science/main': at('../../packages/modules/science/main/index.ts'),
      '@midnite/studio-module-science/renderer': at('../../packages/modules/science/renderer/index.ts'),
      '@midnite/studio-module-simulator/bridge': at('../../packages/modules/simulator/main/bridge.ts'),
      '@midnite/studio-module-simulator/main': at('../../packages/modules/simulator/main/index.ts'),
      '@midnite/studio-module-simulator/renderer': at('../../packages/modules/simulator/renderer/index.ts'),
      '@midnite/studio-feature-monitor/renderer': at('../../packages/features/monitor/renderer/index.ts'),
      '@midnite/studio-feature-monitor/main': at('../../packages/features/monitor/main/index.ts'),
      '@midnite/studio-feature-monitor/bridge': at('../../packages/features/monitor/bridge.ts'),
      '@midnite/studio-shared/ipc/channels': at('../../packages/shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../packages/runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-runtime/app-main/suite-preload': at('../../packages/runtime/src/app-main/suite-preload.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-feature-report/main': at('../../packages/features/report/main/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: [at('../../packages/frame/src/vitest-setup.ts')],
  },
});
