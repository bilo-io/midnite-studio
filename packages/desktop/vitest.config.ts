import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only electron-free modules are unit-tested here — anything importing
    // `electron` can't run outside the Electron runtime.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
