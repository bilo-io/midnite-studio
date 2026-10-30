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
      '@midnite/studio-feature-chats/main': at('../../features/chats/main/index.ts'),
      '@midnite/studio-feature-chats/renderer': at('../../features/chats/renderer/index.ts'),
      '@midnite/studio-feature-chats/renderer/testing': at('../../features/chats/renderer/testing.ts'),
      '@midnite/studio-feature-councils/main': at('../../features/councils/main/index.ts'),
      '@midnite/studio-feature-councils/renderer': at('../../features/councils/renderer/index.ts'),
      '@midnite/studio-feature-councils/renderer/testing': at('../../features/councils/renderer/testing.ts'),
      '@midnite/studio-feature-models/main': at('../../features/models/main/index.ts'),
      '@midnite/studio-feature-models/renderer': at('../../features/models/renderer/index.ts'),
      '@midnite/studio-feature-models/renderer/testing': at('../../features/models/renderer/testing.ts'),
      '@midnite/studio-feature-workflows/main': at('../../features/workflows/main/index.ts'),
      '@midnite/studio-feature-workflows/renderer': at('../../features/workflows/renderer/index.ts'),
      '@midnite/studio-feature-workflows/renderer/testing': at('../../features/workflows/renderer/testing.ts'),
      '@midnite/studio-feature-mcp-tools/main': at('../../features/mcp-tools/main/index.ts'),
      '@midnite/studio-feature-mcp-tools/renderer': at('../../features/mcp-tools/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/manifest': at('../../features/media-audio/manifest.ts'),
      '@midnite/studio-feature-media-game/manifest': at('../../features/media-game/manifest.ts'),
      '@midnite/studio-feature-media-map/manifest': at('../../features/media-map/manifest.ts'),
      '@midnite/studio-feature-media-model/manifest': at('../../features/media-model/manifest.ts'),
      '@midnite/studio-feature-media-sprite/manifest': at('../../features/media-sprite/manifest.ts'),
      '@midnite/studio-feature-media-terrain/manifest': at('../../features/media-terrain/manifest.ts'),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
  },
});
