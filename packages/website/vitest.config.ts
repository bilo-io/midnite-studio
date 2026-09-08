import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Mirrors `vite.config.ts` — the footer's copyright year is a build-time
  // literal, so a test that renders it needs the same substitution.
  define: {
    __BUILD_YEAR__: new Date().getFullYear(),
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/vitest-setup.ts'],
  },
});
