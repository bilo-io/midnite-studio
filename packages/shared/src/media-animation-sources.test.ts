import { describe, expect, it } from 'vitest';

import { ANIMATION_SOURCE_SITES, animationSourceUrl, isAnimationSourceUrl } from './media-animation-sources';

describe('animation source catalogue', () => {
  it('has unique ids and every template is https on its own host with a {q} slot', () => {
    expect(new Set(ANIMATION_SOURCE_SITES.map((s) => s.id)).size).toBe(ANIMATION_SOURCE_SITES.length);
    for (const site of ANIMATION_SOURCE_SITES) {
      expect(new URL(site.searchUrl.replace('{q}', 'x')).hostname).toBe(site.host);
      expect(new URL(site.homeUrl).hostname).toBe(site.host);
      expect(site.searchUrl).toContain('{q}');
    }
  });

  it('percent-encodes the query so it cannot add parameters or change the host', () => {
    const site = ANIMATION_SOURCE_SITES.find((s) => s.id === 'quaternius')!;
    const url = animationSourceUrl(site, 'sword & shield/../#x?y=1');
    expect(url).toBe('https://quaternius.com/search.html?q=sword%20%26%20shield%2F..%2F%23x%3Fy%3D1');
    expect(new URL(url).hostname).toBe('quaternius.com');
  });

  it('opens the site home for an empty or blank query', () => {
    const site = ANIMATION_SOURCE_SITES[0]!;
    expect(animationSourceUrl(site, '   ')).toBe(site.homeUrl);
  });

  it('builds an allow-listed URL for every site', () => {
    for (const site of ANIMATION_SOURCE_SITES) expect(isAnimationSourceUrl(animationSourceUrl(site, 'walk cycle'))).toBe(true);
  });

  it('refuses other hosts, lookalikes, http and non-web schemes', () => {
    for (const url of ['https://evil.example/', 'https://quaternius.com.evil.example/', 'http://quaternius.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user@evil.example@quaternius.com.evil/', 'nope'])
      expect(isAnimationSourceUrl(url)).toBe(false);
  });
});
