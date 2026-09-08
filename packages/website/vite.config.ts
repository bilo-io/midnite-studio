import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The public marketing site.
 *
 * Two things about this build are not the Vite defaults, and both come from
 * where it is served:
 *
 * - **`base` is an environment variable.** The site is published to the
 *   `gh-pages` branch of the *public* `bilo-io/midnite-apps` repo (this repo is
 *   private, so nothing a visitor touches can be served from it), which means
 *   the deployed URL carries a path prefix — `/midnite-apps/midnite-studio/` —
 *   while `vite dev` and `vite preview` serve from `/`. Hard-coding either one
 *   breaks the other, so `WEBSITE_BASE` decides and defaults to the local case.
 *   Everything that builds a URL reads `import.meta.env.BASE_URL` rather than
 *   assuming a leading `/` (see `src/routes.ts`).
 *
 * - **Two HTML entries, not one.** GitHub Pages serves a static tree with no
 *   rewrite rules, so a single-page app's `/download` deep link would 404.
 *   `download/index.html` is a real file in the source tree — a *directory*
 *   index rather than a sibling `download.html`, so both `/download` and
 *   `/download/` resolve without relying on Pages' extension-stripping.
 */
const base = process.env['WEBSITE_BASE'] ?? '/';

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Written so the bundle-size check in CI (and `scripts/website-size.mjs`)
    // can name the entry chunk instead of globbing `assets/index-*.js`.
    manifest: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        download: fileURLToPath(new URL('./download/index.html', import.meta.url)),
      },
    },
  },
});
