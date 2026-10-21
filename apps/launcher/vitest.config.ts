import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Any `@midnite/studio-shared/<file>` to that one source file — the launcher
    // never goes through the package barrel (see vite.config.ts).
    alias: [
      {
        find: /^@midnite\/studio-shared\/(.*)$/,
        replacement: fileURLToPath(new URL('../../packages/shared/src/$1', import.meta.url)),
      },
    ],
  },
  test: {
    // Per-file `// @vitest-environment jsdom` for the renderer; main's tests run in node.
    environment: 'node',
    // `app.test.tsx` mounts the whole launcher in jsdom; under a loaded
    // `moon run :test` that can pass vitest's 5 s default without anything
    // being wrong. Correctness never waits on the clock here — this is headroom.
    testTimeout: 15_000,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
