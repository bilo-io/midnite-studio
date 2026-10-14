import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@midnite/studio-frame': fileURLToPath(new URL('../../packages/frame/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
