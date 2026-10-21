import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors packages/app: the wire contract resolves to its source.
      '@midnite/studio-shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tailwind-preset.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/vitest-setup.ts'],
  },
});
