/**
 * The site's own public root URL — where a visitor's browser is, as an absolute
 * URL rather than a path.
 *
 * `routes.ts` covers every *in-page* URL through `import.meta.env.BASE_URL`, and
 * that is the right tool for an href: the browser resolves it against the page
 * it is already on. This constant exists for the one case a relative path
 * cannot serve — **text a visitor copies out of the page and pastes into a
 * terminal**. The download page's `curl -fsSL <origin>/install.sh | sh` has no
 * page to be relative to, so it needs the origin spelled out.
 *
 * It is the site *root*, not merely the host: on Vercel the two are the same
 * thing (`base` is `/`), but the GitHub Pages target serves the site under
 * `/midnite-apps/midnite-studio/`, so there they differ and the prefix has to be
 * part of the value or the pasted command 404s. `WEBSITE_ORIGIN` is therefore
 * the sibling of `WEBSITE_BASE` — set together, or not at all.
 */

/**
 * Where the site actually lives today: the Vercel project, whose `base` is `/`.
 *
 * The default is here rather than in the two `define` blocks on purpose. Both
 * `vite.config.ts` and `vitest.config.ts` have to inline this constant (the same
 * two-config wiring `__BUILD_YEAR__` uses — see `docs/WEBSITE.md`), and a
 * default repeated in both is a default that will eventually disagree with
 * itself. So they inline only the *override*, empty when unset, and the
 * fallback is read here.
 */
const DEFAULT_SITE_ORIGIN = 'https://midnite-studio-website.vercel.app';

/** The site root, with any trailing slash removed so `${SITE_ORIGIN}/x` is safe. */
export const SITE_ORIGIN: string = (__SITE_ORIGIN__ || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
