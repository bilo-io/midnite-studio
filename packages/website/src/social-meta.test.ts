import { describe, expect, it } from 'vitest';

/**
 * Every HTML entry carries the social card, with absolute URLs.
 *
 * Crawlers never resolve a relative `og:image`, so each one names
 * `%SITE_ORIGIN%`, which `vite.config.ts`'s `socialMeta` plugin stamps with the
 * site's root at build time. The card itself is rendered by
 * `scripts/website-og-image.mjs` and committed.
 */
const ENTRIES = import.meta.glob<string>(
  ['../index.html', '../apps/index.html', '../download/index.html', '../pricing/index.html'],
  { eager: true, query: '?raw', import: 'default' },
);

const CARDS = Object.keys(import.meta.glob('../public/img/og/*.png'));

const content = (html: string, attr: 'property' | 'name', key: string): string | undefined =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe('social meta', () => {
  it('reads all four HTML entries', () => {
    expect(Object.keys(ENTRIES)).toHaveLength(4);
  });

  it('ships the card it points at', () => {
    expect(CARDS).toContain('../public/img/og/midnite-apps.png');
  });

  for (const [path, html] of Object.entries(ENTRIES)) {
    describe(path, () => {
      it('names the card by an absolute URL, at its real size', () => {
        expect(content(html, 'property', 'og:image')).toBe('%SITE_ORIGIN%/img/og/midnite-apps.png');
        expect(content(html, 'name', 'twitter:image')).toBe('%SITE_ORIGIN%/img/og/midnite-apps.png');
        expect(content(html, 'property', 'og:image:width')).toBe('1200');
        expect(content(html, 'property', 'og:image:height')).toBe('630');
        expect(content(html, 'property', 'og:image:alt')).toBeTruthy();
      });

      it('is a large-image card with its own url, title and description', () => {
        expect(content(html, 'name', 'twitter:card')).toBe('summary_large_image');
        expect(content(html, 'property', 'og:url')).toMatch(/^%SITE_ORIGIN%\//);
        expect(content(html, 'name', 'twitter:title')).toBe(content(html, 'property', 'og:title'));
        expect(content(html, 'name', 'twitter:description')).toBeTruthy();
      });
    });
  }
});
