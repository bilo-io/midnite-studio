import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A cold ForceAtlas2 pass over a fixture graph and a real tmpdir cache
    // round-trip both take longer than the default 5s budget under CI load.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // `fileURLToPath`, not `.pathname` — the latter hands back a percent-encoded
      // path, so any checkout under a directory with a space in its name resolves
      // to a file that does not exist. Mirrors packages/git-engine/vitest.config.ts.
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
});
