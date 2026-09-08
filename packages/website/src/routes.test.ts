import { describe, expect, it } from 'vitest';

import { anchorHref, assetHref, hrefFor, routeFor } from './routes';

/**
 * `import.meta.env.BASE_URL` is `/` under vitest, which is the local case.
 * The deployed case — a `/midnite-apps/midnite-studio/` prefix — is covered by
 * the shape of these helpers rather than by a second environment: every one of
 * them is defined as base + suffix, so the tests below pin the suffixes and the
 * prefix is Vite's own concern.
 */
describe('routeFor', () => {
  it('resolves the download page with and without a trailing slash', () => {
    expect(routeFor('/download')).toBe('download');
    expect(routeFor('/download/')).toBe('download');
  });

  it('resolves the landing page from the root', () => {
    expect(routeFor('/')).toBe('landing');
    expect(routeFor('')).toBe('landing');
  });

  it('falls back to the landing page for anything unknown', () => {
    // A static tree cannot give us a real 404, and a page that renders the
    // product beats one that renders an error.
    expect(routeFor('/nope')).toBe('landing');
    expect(routeFor('/download/extra')).toBe('landing');
  });
});

describe('href helpers', () => {
  it('builds page hrefs with a trailing slash on /download/', () => {
    expect(hrefFor('landing')).toBe('/');
    expect(hrefFor('download')).toBe('/download/');
  });

  it('builds anchors against the landing page, so they work from either page', () => {
    expect(anchorHref('early-access')).toBe('/#early-access');
  });

  it('normalises a leading slash on an asset path', () => {
    expect(assetHref('img/logo.png')).toBe('/img/logo.png');
    expect(assetHref('/img/logo.png')).toBe('/img/logo.png');
  });
});
