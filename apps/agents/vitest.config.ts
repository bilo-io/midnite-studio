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
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
      '@midnite/studio-git-engine': at('../../packages/git-engine/src/index.ts'),
      '@midnite/studio-feature-chats/main': at('../../packages/features/chats/main/index.ts'),
      '@midnite/studio-feature-chats/renderer': at('../../packages/features/chats/renderer/index.ts'),
      '@midnite/studio-feature-chats/renderer/testing': at('../../packages/features/chats/renderer/testing.ts'),
      '@midnite/studio-feature-councils/main': at('../../packages/features/councils/main/index.ts'),
      '@midnite/studio-feature-councils/renderer': at('../../packages/features/councils/renderer/index.ts'),
      '@midnite/studio-feature-councils/renderer/testing': at('../../packages/features/councils/renderer/testing.ts'),
      '@midnite/studio-feature-models/main': at('../../packages/features/models/main/index.ts'),
      '@midnite/studio-feature-models/renderer': at('../../packages/features/models/renderer/index.ts'),
      '@midnite/studio-feature-models/renderer/testing': at('../../packages/features/models/renderer/testing.ts'),
      '@midnite/studio-feature-workflows/main': at('../../packages/features/workflows/main/index.ts'),
      '@midnite/studio-feature-workflows/renderer': at('../../packages/features/workflows/renderer/index.ts'),
      '@midnite/studio-feature-workflows/renderer/testing': at('../../packages/features/workflows/renderer/testing.ts'),
      '@midnite/studio-feature-mcp-tools/main': at('../../packages/features/mcp-tools/main/index.ts'),
      '@midnite/studio-feature-mcp-tools/renderer': at('../../packages/features/mcp-tools/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/manifest': at('../../packages/features/media-audio/manifest.ts'),
      '@midnite/studio-feature-media-game/manifest': at('../../packages/features/media-game/manifest.ts'),
      '@midnite/studio-feature-media-map/manifest': at('../../packages/features/media-map/manifest.ts'),
      '@midnite/studio-feature-media-model/manifest': at('../../packages/features/media-model/manifest.ts'),
      '@midnite/studio-feature-media-sprite/manifest': at('../../packages/features/media-sprite/manifest.ts'),
      '@midnite/studio-feature-media-terrain/manifest': at('../../packages/features/media-terrain/manifest.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
  },
});
