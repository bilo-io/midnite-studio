import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The public marketing site.
 *
 * Two things about this build are not the Vite defaults, and both come from
 * where it is served:
 *
 * - **`base` is an environment variable.** This is a static tree published to
 *   a *public* host (this repo is private, so nothing a visitor touches can be
 *   served from it), and which host decides whether the deployed URL carries a
 *   path prefix: served from a per-app directory it is
 *   `/midnite-apps/midnite-studio/`, served from a domain root it is `/`, and
 *   `vite dev` and `vite preview` are always `/`. Hard-coding any one of those
 *   breaks the others, so `WEBSITE_BASE` decides and defaults to the local
 *   case. Everything that builds a URL reads `import.meta.env.BASE_URL` rather
 *   than assuming a leading `/` (see `src/routes.ts`). `docs/WEBSITE.md` lists
 *   the deploy targets and what each one sets it to.
 *
 * - **`WEBSITE_ORIGIN` is its sibling.** `base` covers every URL the *browser*
 *   resolves; it cannot help text a visitor copies out of the page and pastes
 *   into a terminal, which is what the download page's
 *   `curl -fsSL <origin>/install.sh | sh` is. So the site's own public root is
 *   also spelled out absolutely, defaulting to the live Vercel deployment. It
 *   is the root and not the bare host: a target whose `base` is not `/` must
 *   set this to origin + prefix, or the pasted command 404s. See
 *   `src/site-origin.ts`.
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

/**
 * The site's own public root URL — the *override* only.
 *
 * `src/site-origin.ts` owns the default, so it is not repeated in the two
 * `define` blocks that have to inline this: a default written twice is one that
 * will eventually disagree with itself.
 */
const siteOrigin = process.env['WEBSITE_ORIGIN'] ?? '';

export default defineConfig({
  plugins: [react()],
  base,
  /*
    Build-time constants. `__BUILD_YEAR__` is the footer's copyright year — see
    `src/globals.d.ts` for why it is inlined here rather than read from the
    clock at runtime; `__SITE_ORIGIN__` is the `WEBSITE_ORIGIN` override, read
    through `src/site-origin.ts`. `vitest.config.ts` declares all three, because
    a test rendering the footer, the early-access link or the install command
    needs the literals too.
  */
  define: {
    __BUILD_YEAR__: new Date().getFullYear(),
    __ISSUE_TEMPLATE__: JSON.stringify(issueTemplate),
    __SITE_ORIGIN__: JSON.stringify(siteOrigin),
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
