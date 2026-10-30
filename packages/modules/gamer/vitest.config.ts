import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const feature = (name: string, entry: string) => at(`../../features/${name}/${entry}`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-runtime/agent-run/run-shim': at('../../runtime/src/agent-run/run-shim.ts'),
      '@midnite/studio-shared': at('../../shared/src/index.ts'),
      '@midnite/studio-feature-report/main': at('../../features/report/main/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../frame/src/index.ts'),
      '@midnite/studio-runtime': at('../../runtime/src/index.ts'),
      '@midnite/studio-git-engine': at('../../git-engine/src/index.ts'),
      '@midnite/studio-feature-media-core/main': feature('media-core', 'main/index.ts'),
      '@midnite/studio-feature-media-map/main': feature('media-map', 'main/index.ts'),
      '@midnite/studio-feature-media-map/map-capture-worker': feature('media-map', 'main/map/worker-entry.ts'),
      '@midnite/studio-feature-media-terrain/main': feature('media-terrain', 'main/index.ts'),
      '@midnite/studio-feature-media-terrain/terrain-worker': feature('media-terrain', 'main/terrain/worker-entry.ts'),
      '@midnite/studio-feature-media-sprite/main': feature('media-sprite', 'main/index.ts'),
      '@midnite/studio-feature-media-game/main': feature('media-game', 'main/index.ts'),
      '@midnite/studio-feature-media-model/main': feature('media-model', 'main/index.ts'),
      '@midnite/studio-feature-media-images/main': feature('media-images', 'main/index.ts'),
      '@midnite/studio-feature-models/main': feature('models', 'main/index.ts'),
      '@midnite/studio-feature-media-core/renderer': feature('media-core', 'renderer/index.ts'),
      '@midnite/studio-feature-media-map/renderer': feature('media-map', 'renderer/index.ts'),
      '@midnite/studio-feature-media-terrain/renderer': feature('media-terrain', 'renderer/index.ts'),
      '@midnite/studio-feature-media-sprite/renderer': feature('media-sprite', 'renderer/index.ts'),
      '@midnite/studio-feature-media-sprite/events': feature('media-sprite', 'renderer/events.ts'),
      '@midnite/studio-feature-media-model/renderer': feature('media-model', 'renderer/index.ts'),
      '@midnite/studio-feature-media-model/events': feature('media-model', 'renderer/events.ts'),
      '@midnite/studio-feature-media-model/kernel': feature('media-model', 'renderer/kernel.ts'),
      '@midnite/studio-feature-media-model/render-job': feature('media-model', 'renderer/render-job.ts'),
      '@midnite/studio-feature-media-game/renderer': feature('media-game', 'renderer/index.ts'),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
  },
});
