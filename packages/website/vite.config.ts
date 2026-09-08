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
 * - **Two HTML entries, not one.** The site is served as a static tree with no
 *   rewrite rules — true of GitHub Pages, and true of any other static host —
 *   so a single-page app's `/download` deep link would 404.
 *   `download/index.html` is a real file in the source tree, a *directory*
 *   index rather than a sibling `download.html`, so both `/download` and
 *   `/download/` resolve without relying on a host's extension-stripping.
 */
const base = process.env['WEBSITE_BASE'] ?? '/';

/**
 * The GitHub issue form the early-access section prefills, or `null`.
 *
 * A build-time constant rather than a source literal because it is a fact about
 * the *other* repo, not about this code: the form only works once
 * `.github/ISSUE_TEMPLATE/early-access.yml` exists in `bilo-io/midnite-apps`,
 * and naming a `template=` that does not exist gets the visitor GitHub's
 * template chooser with every prefilled field silently dropped — strictly worse
 * than the plain `?title=&body=` URL. Unset, which is the default and the state
 * today, means the plain URL. See `docs/WEBSITE.md` § Early access.
 */
const issueTemplate = process.env['WEBSITE_ISSUE_TEMPLATE'] || null;

export default defineConfig({
  plugins: [react()],
  base,
  /*
    Build-time constants. `__BUILD_YEAR__` is the footer's copyright year — see
    `src/globals.d.ts` for why it is inlined here rather than read from the
    clock at runtime. `vitest.config.ts` declares the same one, because a test
    rendering the footer needs the literal too.
  */
  define: {
    __BUILD_YEAR__: new Date().getFullYear(),
    __ISSUE_TEMPLATE__: JSON.stringify(issueTemplate),
  },
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
