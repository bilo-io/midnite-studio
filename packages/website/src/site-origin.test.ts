import { describe, expect, it } from 'vitest';

import { SITE_ORIGIN } from './site-origin';

describe('SITE_ORIGIN', () => {
  /**
   * `vitest.config.ts` pins the `WEBSITE_ORIGIN` override empty, so this is the
   * default the site ships with — the live Vercel deployment. Asserting it here
   * is what catches the default being edited in one place and not the other.
   */
  it('defaults to the live deployment', () => {
    expect(SITE_ORIGIN).toBe('https://midnite-studio-website.vercel.app');
  });

  /** `${SITE_ORIGIN}/install.sh` must never produce a double slash. */
  it('carries no trailing slash', () => {
    expect(SITE_ORIGIN.endsWith('/')).toBe(false);
  });
});
