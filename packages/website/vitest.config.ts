import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Mirrors `vite.config.ts` — the footer's copyright year is a build-time
  // literal, so a test that renders it needs the same substitution.
  //
  // `__ISSUE_TEMPLATE__` is pinned to `null` here rather than read from
  // `WEBSITE_ISSUE_TEMPLATE` like the real build does, on purpose: a suite whose
  // assertions depend on an ambient environment variable passes or fails by
  // whatever the shell happens to export. The template branch is exercised by
  // passing `composeIssueUrl` its optional second argument instead, so both
  // branches are covered deterministically in every environment.
  define: {
    __BUILD_YEAR__: new Date().getFullYear(),
    __ISSUE_TEMPLATE__: null,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/vitest-setup.ts'],
  },
});
