import { describe, expect, it } from 'vitest';

import { landingFromArgv, landingFromLink, midniteLinkFromArgv } from './suite-link';

describe('midniteLinkFromArgv', () => {
  it('reads the value of --midnite-link=', () => {
    expect(midniteLinkFromArgv(['x', '--midnite-link=midnite://open?app=agents'])).toBe('midnite://open?app=agents');
  });
  it('takes the last switch, so a newer link beats a stale one', () => {
    expect(midniteLinkFromArgv(['--midnite-link=midnite://open?app=agents&view=a', '--midnite-link=midnite://open?app=agents&view=b'])).toBe('midnite://open?app=agents&view=b');
  });
  it('is undefined without the switch, and does not treat a bare link as one', () => {
    expect(midniteLinkFromArgv(['x', 'midnite://open?app=agents'])).toBeUndefined();
  });
});

describe('landingFromLink', () => {
  it('keeps the module and view', () => {
    expect(landingFromLink('midnite://open?app=agents&module=coder&view=reviews')).toEqual({ module: 'coder', view: 'reviews' });
  });
  it('resolves a retired id to its host module', () => {
    expect(landingFromLink('midnite://open?app=coder&view=reviews')).toEqual({ module: 'coder', view: 'reviews' });
  });
  it('drops a module the app does not host, and a malformed view', () => {
    expect(landingFromLink('midnite://open?app=agents&module=vault')).toBeNull();
    expect(landingFromLink('midnite://open?app=agents&view=../etc')).toBeNull();
  });
  it('is null for a non-link, another scheme or another action', () => {
    expect(landingFromLink(undefined)).toBeNull();
    expect(landingFromLink('https://example.com')).toBeNull();
    expect(landingFromLink('midnite://reveal?app=agents&module=coder')).toBeNull();
  });
});

describe('landingFromArgv', () => {
  it('combines the two', () => {
    expect(landingFromArgv(['a', '--midnite-link=midnite://open?app=agents&module=creator'])).toEqual({ module: 'creator' });
    expect(landingFromArgv(['a'])).toBeNull();
  });
});
