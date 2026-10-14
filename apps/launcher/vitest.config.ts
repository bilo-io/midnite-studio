import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared/studio-link': fileURLToPath(
        new URL('../../packages/shared/src/studio-link.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Per-file `// @vitest-environment jsdom` for the renderer; main's tests run in node.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
