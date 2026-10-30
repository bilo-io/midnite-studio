import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  // Both halves resolve the contract and the runtime from source, so the suite needs no build ahead of it.
  '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
  '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
};

// One flat project (the root node gate loads each package's config as a project and cannot nest more):
// the renderer needs jsdom and a host before every test, so the main half's tests opt into node with a
// `@vitest-environment node` docblock.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./renderer/test-setup.ts'],
  },
});
