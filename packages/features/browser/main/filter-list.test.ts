import { describe, expect, it } from 'vitest';

import { EASYPRIVACY_META, EASYPRIVACY_RULES } from './data/easyprivacy.generated';
import { parseFilterList } from './filter-list';

const list = parseFilterList(
  [
    '! comment',
    '[Adblock Plus 1.1]',
    '||tracker.example^$third-party',
    '||metrics.example/collect*',
    '||cdn.example^$script',
    '||ok.example^',
    '@@||ok.example/allowed^',
    '||bad.example^$domain=x.com',
    '##.banner',
    '/generic/path',
  ].join('\n'),
);

describe('parseFilterList', () => {
  it('counts what it keeps and what it drops', () => {
    expect(list.stats).toEqual({ block: 4, exceptions: 1, skipped: 3 });
  });
  it('matches a host and its subdomains, third-party only when asked', () => {
    expect(list.match({ url: 'https://a.tracker.example/x.js', resourceType: 'script', thirdParty: true })).toBe('tracker.example');
    expect(list.match({ url: 'https://tracker.example/x.js', resourceType: 'script', thirdParty: false })).toBeNull();
  });
  it('honours path patterns and type options', () => {
    expect(list.match({ url: 'https://metrics.example/collect?id=1', resourceType: 'xhr', thirdParty: true })).toBe('metrics.example');
    expect(list.match({ url: 'https://metrics.example/other', resourceType: 'xhr', thirdParty: true })).toBeNull();
    expect(list.match({ url: 'https://cdn.example/a.js', resourceType: 'script', thirdParty: true })).toBe('cdn.example');
    expect(list.match({ url: 'https://cdn.example/a.png', resourceType: 'image', thirdParty: true })).toBeNull();
  });
  it('lets an exception win and never guesses at unmodelled options', () => {
    expect(list.match({ url: 'https://ok.example/allowed/x', resourceType: 'script', thirdParty: true })).toBeNull();
    expect(list.match({ url: 'https://ok.example/other', resourceType: 'script', thirdParty: true })).toBe('ok.example');
    expect(list.match({ url: 'https://bad.example/', resourceType: 'script', thirdParty: true })).toBeNull();
  });
  it('ignores non-http URLs and garbage', () => {
    expect(list.match({ url: 'data:text/plain,hi', resourceType: 'image', thirdParty: true })).toBeNull();
    expect(list.match({ url: 'not a url', resourceType: 'image', thirdParty: true })).toBeNull();
  });
});

describe('the bundled EasyPrivacy list', () => {
  const real = parseFilterList(EASYPRIVACY_RULES);
  it('records its provenance and licence', () => {
    expect(EASYPRIVACY_META.licence).toMatch(/CC-BY-SA-3\.0/);
    expect(EASYPRIVACY_META.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('parses to tens of thousands of rules', () => {
    expect(real.stats.block).toBeGreaterThan(30_000);
  });
  it('blocks a known tracker and spares an ordinary site', () => {
    expect(real.match({ url: 'https://www.google-analytics.com/analytics.js', resourceType: 'script', thirdParty: true })).not.toBeNull();
    expect(real.match({ url: 'https://example.com/index.html', resourceType: 'script', thirdParty: true })).toBeNull();
  });
});
