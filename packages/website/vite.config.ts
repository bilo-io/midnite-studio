import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { MIDNITE_SITE_ORIGIN } from '../shared/src/install-command';

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
 * - **Four HTML entries, not one.** The site is served as a static tree with
 *   no rewrite rules — true of GitHub Pages, and true of any other static host
 *   — so a single-page app's `/apps`, `/download` or `/pricing` deep link would
 *   404. Each route is a real directory index (`apps/index.html`,
 *   `download/index.html`, `pricing/index.html`) rather than a sibling `.html` file, so both
 *   `/download` and `/download/` resolve without relying on a host's
 *   extension-stripping.
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

/**
 * Stamps the site's absolute root into every HTML entry's `%SITE_ORIGIN%`.
 *
 * Open Graph and Twitter cards are read by crawlers that never resolve a
 * relative URL, so `og:image` and `og:url` must be absolute — and which host
 * they name is the same deploy-time fact `WEBSITE_ORIGIN` already carries. The
 * fallback is `site-origin.ts`'s own, imported from the same file rather than
 * restated, so the card and the install command cannot name different hosts.
 */
const socialMeta = (): Plugin => {
  const origin = (siteOrigin || MIDNITE_SITE_ORIGIN).replace(/\/+$/, '');
  return {
    name: 'website-social-meta',
    transformIndexHtml: (html) => html.replaceAll('%SITE_ORIGIN%', origin),
  };
};

export default defineConfig({
  plugins: [react(), socialMeta()],
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
      /*
        The installer command, shared with the app's "Update Midnite Studio"
        action so the two can never curl different URLs. Aliased to the one
        source file rather than resolved through the package: the barrel pulls
        every zod schema in the wire contract, which a static marketing bundle
        has no use for, and `install-command.ts` imports nothing at all.
      */
      '@midnite/studio-shared/install-command': fileURLToPath(
        new URL('../shared/src/install-command.ts', import.meta.url),
      ),
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
        apps: fileURLToPath(new URL('./apps/index.html', import.meta.url)),
        download: fileURLToPath(new URL('./download/index.html', import.meta.url)),
        pricing: fileURLToPath(new URL('./pricing/index.html', import.meta.url)),
      },
    },
  },
});
