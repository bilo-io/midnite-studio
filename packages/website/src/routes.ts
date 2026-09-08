/**
 * The site's two pages, and how a URL becomes one.
 *
 * There is no router dependency here on purpose. Two static pages need a
 * comparison, not a route table, and the deployment shape does the rest: each
 * page is a real HTML file (`index.html`, `download/index.html`), so GitHub
 * Pages serves a deep link directly and no client-side history rewriting has to
 * exist. What this module does is (a) tell the already-loaded page which of the
 * two it is, and (b) build hrefs that survive the `base` prefix the deployed
 * site carries — see the note on `base` in `vite.config.ts`.
 */

export type Route = 'landing' | 'download';

/**
 * `import.meta.env.BASE_URL` always ends in `/` (Vite normalises it), so this
 * is `/` locally and `/midnite-apps/midnite-studio/` on Pages.
 */
const baseUrl = (): string => import.meta.env.BASE_URL;

/** Strip the deployment prefix, leaving a path to compare against. */
const withoutBase = (pathname: string): string => {
  const base = baseUrl();
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  return rest.replace(/\/+$/, '');
};

/**
 * Which page is this? Anything that is not the download path is the landing
 * page, including an unknown path: a 404 that renders the product beats a 404
 * that renders an error, and Pages has no way to give us a real one anyway.
 */
export const routeFor = (pathname: string): Route =>
  withoutBase(pathname) === 'download' ? 'download' : 'landing';

/** A base-aware href for one of the two pages. */
export const hrefFor = (route: Route): string =>
  route === 'download' ? `${baseUrl()}download/` : baseUrl();

/** A base-aware href for an on-page anchor, usable from either page. */
export const anchorHref = (id: string): string => `${baseUrl()}#${id}`;

/** A base-aware URL for a file under `public/`. */
export const assetHref = (path: string): string => `${baseUrl()}${path.replace(/^\//, '')}`;
