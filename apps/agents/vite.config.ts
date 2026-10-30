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
      '@midnite/studio-frame/graph': at('../../packages/frame/src/graph/index.ts'),
      '@midnite/studio-frame/diff': at('../../packages/frame/src/diff/index.ts'),
      '@midnite/studio-feature-api-client/renderer': at('../../packages/features/api-client/renderer/index.ts'),
      '@midnite/studio-feature-database/renderer': at('../../packages/features/database/renderer/index.ts'),
      '@midnite/studio-feature-forge/renderer': at('../../packages/features/forge/renderer/index.ts'),
      '@midnite/studio-feature-tests/renderer': at('../../packages/features/tests/renderer/index.ts'),
      '@midnite/studio-feature-sessions/renderer': at('../../packages/features/sessions/renderer/index.ts'),
      '@midnite/studio-feature-tasks/renderer/state': at('../../packages/features/tasks/renderer/state.ts'),
      '@midnite/studio-feature-tasks/renderer': at('../../packages/features/tasks/renderer/index.ts'),
      '@midnite/studio-feature-media-core/renderer': at('../../packages/features/media-core/renderer/index.ts'),
      '@midnite/studio-feature-media-docs/renderer': at('../../packages/features/media-docs/renderer/index.ts'),
      '@midnite/studio-feature-media-images/renderer': at('../../packages/features/media-images/renderer/index.ts'),
      '@midnite/studio-feature-slides/renderer/modal': at('../../packages/features/slides/renderer/modal.ts'),
      '@midnite/studio-feature-slides/renderer': at('../../packages/features/slides/renderer/index.ts'),
      '@midnite/studio-feature-media-video/renderer': at('../../packages/features/media-video/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/renderer': at('../../packages/features/media-audio/renderer/index.ts'),
      '@midnite/studio-module-coder/renderer': at('../../packages/modules/coder/renderer/index.ts'),
      '@midnite/studio-module-creator/renderer': at('../../packages/modules/creator/renderer/index.ts'),
      '@midnite/studio-module-agents/renderer': at('../../packages/modules/agents/renderer/index.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-feature-chats/renderer': at('../../packages/features/chats/renderer/index.ts'),
      '@midnite/studio-feature-councils/renderer': at('../../packages/features/councils/renderer/index.ts'),
      '@midnite/studio-feature-models/renderer': at('../../packages/features/models/renderer/index.ts'),
      '@midnite/studio-feature-workflows/renderer': at('../../packages/features/workflows/renderer/index.ts'),
      '@midnite/studio-feature-mcp-tools/renderer': at('../../packages/features/mcp-tools/renderer/index.ts'),
      '@midnite/studio-feature-media-audio/manifest': at('../../packages/features/media-audio/manifest.ts'),
      '@midnite/studio-feature-media-game/manifest': at('../../packages/features/media-game/manifest.ts'),
      '@midnite/studio-feature-media-map/manifest': at('../../packages/features/media-map/manifest.ts'),
      '@midnite/studio-feature-media-model/manifest': at('../../packages/features/media-model/manifest.ts'),
      '@midnite/studio-feature-media-sprite/manifest': at('../../packages/features/media-sprite/manifest.ts'),
      '@midnite/studio-feature-media-terrain/manifest': at('../../packages/features/media-terrain/manifest.ts'),
    },
  },
  server: { port: 5190, strictPort: true },
  build: {
    outDir: at('./dist'),
    emptyOutDir: true,
  },
});
