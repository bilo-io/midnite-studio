import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
});
