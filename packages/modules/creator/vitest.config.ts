import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../shared/src/index.ts'),
      '@midnite/studio-frame': at('../../frame/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../features/report/renderer/index.ts'),
      '@midnite/studio-feature-report/main': at('../../features/report/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../features/report/bridge.ts'),
      '@midnite/studio-runtime': at('../../runtime/src/index.ts'),
      '@midnite/studio-feature-media-core/main': at('../../features/media-core/main/index.ts'),
      '@midnite/studio-feature-media-docs/main': at('../../features/media-docs/main/index.ts'),
      '@midnite/studio-feature-media-images/main': at('../../features/media-images/main/index.ts'),
      '@midnite/studio-feature-media-video/main': at('../../features/media-video/main/index.ts'),
      '@midnite/studio-feature-media-audio/main': at('../../features/media-audio/main/index.ts'),
      '@midnite/studio-feature-media-core/renderer': at('../../features/media-core/renderer/index.ts'),
      '@midnite/studio-feature-media-docs/renderer': at('../../features/media-docs/renderer/index.ts'),
      '@midnite/studio-feature-media-images/renderer': at('../../features/media-images/renderer/index.ts'),
      '@midnite/studio-feature-slides/renderer/modal': at('../../features/slides/renderer/modal.ts'),
      '@midnite/studio-feature-slides/renderer': at('../../features/slides/renderer/index.ts'),
      '@midnite/studio-feature-media-video/renderer': at('../../features/media-video/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/renderer': at('../../features/media-audio/renderer/index.ts'),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
  },
});
