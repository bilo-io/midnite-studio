import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  // Both halves resolve the contract and the runtime from source, so the suite needs no build ahead of it.
  '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
  '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
};

// Two projects: the renderer needs jsdom and a host installed before every test; main is plain Node.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'renderer', include: ['renderer/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['./renderer/test-setup.ts'] },
      },
      {
        extends: true,
        test: { name: 'main', include: ['main/**/*.test.ts', 'manifest.test.ts'], environment: 'node' },
      },
    ],
  },
});
