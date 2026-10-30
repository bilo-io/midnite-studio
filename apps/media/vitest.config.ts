import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@midnite/studio-feature-media-docs/renderer': at('../../packages/features/media-docs/renderer/index.ts'),
      '@midnite/studio-feature-media-images/renderer': at('../../packages/features/media-images/renderer/index.ts'),
      '@midnite/studio-feature-slides/renderer/modal': at('../../packages/features/slides/renderer/modal.ts'),
      '@midnite/studio-feature-slides/renderer': at('../../packages/features/slides/renderer/index.ts'),
      '@midnite/studio-feature-media-video/renderer': at('../../packages/features/media-video/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/renderer': at('../../packages/features/media-audio/renderer/index.ts'),
      '@midnite/studio-module-creator/main': at('../../packages/modules/creator/main/index.ts'),
      '@midnite/studio-module-creator/bridge': at('../../packages/modules/creator/main/bridge.ts'),
      '@midnite/studio-feature-report/bridge': at('../../packages/features/report/bridge.ts'),
      '@midnite/studio-feature-media-core/main': at('../../packages/features/media-core/main/index.ts'),
      '@midnite/studio-feature-media-docs/main': at('../../packages/features/media-docs/main/index.ts'),
      '@midnite/studio-feature-media-images/main': at('../../packages/features/media-images/main/index.ts'),
      '@midnite/studio-feature-media-video/main': at('../../packages/features/media-video/main/index.ts'),
      '@midnite/studio-feature-media-audio/main': at('../../packages/features/media-audio/main/index.ts'),
      '@midnite/studio-module-media/bridge': at('../../packages/modules/media/main/bridge.ts'),
      '@midnite/studio-module-media/main': at('../../packages/modules/media/main/index.ts'),
      '@midnite/studio-module-creator/renderer': at('../../packages/modules/creator/renderer/index.ts'),
      '@midnite/studio-module-media/renderer': at('../../packages/modules/media/renderer/index.ts'),
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
      '@midnite/studio-feature-media-library/main': at('../../packages/features/media-library/main/index.ts'),
      '@midnite/studio-feature-media-core/renderer': at('../../packages/features/media-core/renderer/index.ts'),
      '@midnite/studio-feature-media-library/renderer': at('../../packages/features/media-library/renderer/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: [at('../../packages/frame/src/vitest-setup.ts')],
  },
});
