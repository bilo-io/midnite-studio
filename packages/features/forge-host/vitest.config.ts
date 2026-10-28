import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
      '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
      '@midnite/studio-git-engine': fileURLToPath(new URL('../../git-engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'node',
  },
});
