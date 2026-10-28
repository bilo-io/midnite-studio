import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Both halves resolve the contract and the runtime from source, so the
      // suite needs no build ahead of it (the runtime alias mirrors shared's).
      '@midnite/studio-shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
      '@midnite/studio-runtime': fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url)),
      '@midnite/studio-git-engine': fileURLToPath(new URL('../../git-engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
    // The main half runs under plain Node: its ArrayBuffer/Uint8Array checks (the glTF loader, the PNG and
    // mesh codecs) fail across jsdom's realm. Vitest 4 removed `environmentMatchGlobs`, and this config is a
    // project of the workspace gate, so each main/** test file carries a `@vitest-environment node` header.
  },
});
