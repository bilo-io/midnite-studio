import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Integration tests shell out to real git on temp repos; give them room.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // `fileURLToPath`, not `.pathname` — the latter hands back a percent-encoded
      // path, so any checkout under a directory with a space in its name resolves
      // to a file that does not exist. Mirrors packages/app/vitest.config.ts.
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
});
