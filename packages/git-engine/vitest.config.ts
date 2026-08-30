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
      '@midnite/studio-shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
