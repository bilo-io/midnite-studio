import { describe, expect, it } from 'vitest';

import { createLinkRateLimiter, isActingPageLinkKind, PAGE_LINK_RATE_WINDOW_MS } from './page-deep-link';

describe('the page deep-link rate limit', () => {
  it('lets one acting link per origin through per 10 s', () => {
    let t = 0;
    const limiter = createLinkRateLimiter(PAGE_LINK_RATE_WINDOW_MS, () => t);
    expect(limiter.allow('https://lure.example')).toBe(true);
    t = 9_999;
    expect(limiter.allow('https://lure.example')).toBe(false);
    expect(limiter.allow('https://other.example')).toBe(true);
    t = 10_000;
    expect(limiter.allow('https://lure.example')).toBe(true);
  });

  it('a dropped attempt does not extend the window', () => {
    let t = 0;
    const limiter = createLinkRateLimiter(10_000, () => t);
    limiter.allow('o');
    t = 5_000;
    expect(limiter.allow('o')).toBe(false);
    t = 10_001;
    expect(limiter.allow('o')).toBe(true);
  });

  it('knows which kinds act', () => {
    expect(isActingPageLinkKind('run')).toBe(true);
    expect(isActingPageLinkKind('clone')).toBe(true);
    expect(isActingPageLinkKind('view')).toBe(false);
  });
});
