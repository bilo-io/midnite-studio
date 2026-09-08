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
  //
  // `__SITE_ORIGIN__` is pinned empty for the same reason, which leaves
  // `SITE_ORIGIN` on its default: a test asserting the install command should
  // assert what the site ships, not whatever is in the runner's environment.
  define: {
    __BUILD_YEAR__: new Date().getFullYear(),
    __ISSUE_TEMPLATE__: null,
    __SITE_ORIGIN__: JSON.stringify(''),
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/vitest-setup.ts'],
    /*
      Let CSS requests through Vite instead of stubbing them.
      `colour-tokens.test.tsx` reads `styles/*.css` as text
      (`import.meta.glob(..., { query: '?raw' })`) so it can parse the authored
      stylesheet with postcss and assert on the tokens and the neon pulse.
      Vitest's default is `css: false`, which short-circuits **any** request
      whose path ends in `.css` — the `?raw` query included — and hands back an
      empty module, so those assertions would all pass against "". Nothing else
      in the suite imports a stylesheet, so this costs one file read.
    */
    css: true,
  },
});
