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
      '@midnite/studio-feature-forge/main': at('../../packages/features/forge/main/index.ts'),
      '@midnite/studio-feature-forge/renderer': at('../../packages/features/forge/renderer/index.ts'),
      '@midnite/studio-feature-forge/renderer/testing': at('../../packages/features/forge/renderer/testing.ts'),
      '@midnite/studio-feature-tests/main': at('../../packages/features/tests/main/index.ts'),
      '@midnite/studio-feature-tests/renderer': at('../../packages/features/tests/renderer/index.ts'),
      '@midnite/studio-feature-tests/renderer/testing': at('../../packages/features/tests/renderer/testing.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
    // No test can act as the user on GitHub (a stale mock once let the real `gh` open an issue).
    setupFiles: ['../../scripts/vitest-isolate-gh.mjs'],
  },
});
