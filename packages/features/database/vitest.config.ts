import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Both halves resolve the contract, the runtime and the engine from source, so the
      // suite needs no build ahead of it (the runtime alias mirrors shared's).
      '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
      '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
      '@midnite/studio-db-engine': fileURLToPath(new URL('../../db-engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
  },
});
