import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Both halves resolve the contract and the runtime from source, so the
      // suite needs no build ahead of it. The channels subpath is what bridge.ts imports.
      '@midnite/studio-shared/ipc/channels': fileURLToPath(new URL('../../shared/src/ipc/channels.ts', import.meta.url)),
      '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
      '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'bridge.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
    // No test can act as the user on GitHub: this feature's whole job is `gh issue create`.
    setupFiles: ['../../../scripts/vitest-isolate-gh.mjs'],
  },
});
