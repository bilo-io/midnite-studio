import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The contract from source, so the suite needs no build ahead of it.
      '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'manifest.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
  },
});
