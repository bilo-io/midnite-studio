import { domainToUnicode } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  COMMONLY_IMPERSONATED_HOSTS,
  confusableSkeleton,
  displayHost,
  findLookalike,
  hostToUnicode,
  isUniformScript,
  punycodeDecode,
} from './lookalike';

describe('punycodeDecode', () => {
  it.each(['xn--pple-43d.com', 'xn--mnchen-3ya.de', 'xn--fiqs8s.cn', 'xn--80ak6aa92e.com', 'xn--bcher-kva.example'])(
    'matches node:url for %s',
    (host) => {
      expect(hostToUnicode(host)).toBe(domainToUnicode(host));
    },
  );

  it('returns null on malformed input', () => {
    expect(punycodeDecode('!!')).toBeNull();
  });

  it('leaves a malformed xn-- label as it was', () => {
    expect(hostToUnicode('xn--!!.com')).toBe('xn--!!.com');
  });
});

describe('isUniformScript', () => {
  it('flags Latin mixed with Cyrillic', () => {
    expect(isUniformScript('аpple')).toBe(false);
  });
  it('accepts a single script, digits and hyphens', () => {
    expect(isUniformScript('münchen-2024')).toBe(true);
    expect(isUniformScript('пример')).toBe(true);
  });
  it('treats Han + Kana as one (Japanese)', () => {
    expect(isUniformScript('東京タワー')).toBe(true);
  });
});

describe('confusableSkeleton', () => {
  it('folds Cyrillic, digit and rn lookalikes onto Latin', () => {
    const apple = confusableSkeleton('apple.com');
    expect(confusableSkeleton('xn--pple-43d.com')).toBe(apple);
    expect(confusableSkeleton('app1e.com')).toBe(apple);
    expect(confusableSkeleton('appIe.com')).toBe(apple);
    expect(confusableSkeleton('rnicrosoft.com')).toBe(confusableSkeleton('microsoft.com'));
    expect(confusableSkeleton('g00gle.com')).toBe(confusableSkeleton('google.com'));
  });
  it('strips diacritics', () => {
    expect(confusableSkeleton('pаypàl.com')).toBe(confusableSkeleton('paypal.com'));
  });
});

describe('findLookalike', () => {
  it('flags xn--pple-43d.com as mixed-script against apple.com (acceptance)', () => {
    expect(findLookalike('xn--pple-43d.com', COMMONLY_IMPERSONATED_HOSTS)).toEqual({
      kind: 'idn-mixed-script',
      displayHost: 'xn--pple-43d.com',
      against: 'apple.com',
    });
  });

  it('flags an ASCII confusable of a known host', () => {
    expect(findLookalike('paypa1.com', COMMONLY_IMPERSONATED_HOSTS)).toMatchObject({
      kind: 'confusable',
      against: 'paypal.com',
    });
  });

  it('flags a whole-script Cyrillic confusable', () => {
    // аррӏе.com — every letter Cyrillic, so uniform-script, but it reads as apple.com.
    const host = new URL('https://аррӏе.com').hostname;
    expect(findLookalike(host, ['apple.com'])).toMatchObject({ kind: 'confusable', against: 'apple.com' });
  });

  it('flags a mixed-script host with no known target', () => {
    expect(findLookalike('xn--pple-43d.example', [])).toEqual({
      kind: 'idn-mixed-script',
      displayHost: 'xn--pple-43d.example',
    });
  });

  it('is null for the known host itself, with or without www.', () => {
    expect(findLookalike('github.com', COMMONLY_IMPERSONATED_HOSTS)).toBeNull();
    expect(findLookalike('www.github.com', COMMONLY_IMPERSONATED_HOSTS)).toBeNull();
  });

  it('is null for an ordinary unrelated host and a uniform IDN', () => {
    expect(findLookalike('example.org', COMMONLY_IMPERSONATED_HOSTS)).toBeNull();
    expect(findLookalike('xn--mnchen-3ya.de', COMMONLY_IMPERSONATED_HOSTS)).toBeNull();
  });
});

describe('displayHost', () => {
  it('keeps a mixed-script host in punycode', () => {
    expect(displayHost('xn--pple-43d.com')).toBe('xn--pple-43d.com');
  });
  it('shows a uniform, non-lookalike IDN in Unicode', () => {
    expect(displayHost('xn--mnchen-3ya.de')).toBe('münchen.de');
  });
  it('keeps a whole-script lookalike in punycode', () => {
    const host = new URL('https://аррӏе.com').hostname;
    expect(displayHost(host)).toBe(host);
  });
  it('passes ASCII through, lower-cased', () => {
    expect(displayHost('GitHub.com')).toBe('github.com');
  });
});
