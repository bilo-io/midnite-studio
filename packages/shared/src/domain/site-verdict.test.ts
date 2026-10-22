import { describe, expect, it } from 'vitest';

import { BrowserEventSchema } from './browser';
import {
  SiteVerdictSchema,
  emptySiteVerdict,
  isLoopbackHost,
  siteVerdictLevel,
  siteVerdictLines,
  type SiteVerdict,
} from './site-verdict';

const https = (patch: Partial<SiteVerdict> = {}): SiteVerdict => ({ ...emptySiteVerdict('https://example.com/a'), ...patch });

describe('emptySiteVerdict', () => {
  it('starts https as tls ok and http as none, with no findings', () => {
    expect(emptySiteVerdict('https://example.com/x')).toMatchObject({ origin: 'https://example.com', tls: 'ok', reputation: 'unavailable' });
    expect(emptySiteVerdict('http://example.com/x').tls).toBe('none');
    expect(SiteVerdictSchema.parse(emptySiteVerdict('https://example.com'))).toBeTruthy();
  });
  it('is blank for a non-web URL', () => {
    expect(emptySiteVerdict('about:blank')).toMatchObject({ origin: '', displayHost: '' });
  });
});

describe('isLoopbackHost', () => {
  it.each(['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]'])('%s is loopback', (h) => {
    expect(isLoopbackHost(h)).toBe(true);
  });
  it.each(['example.com', '10.0.0.1', 'localhost.evil.com'])('%s is not', (h) => {
    expect(isLoopbackHost(h)).toBe(false);
  });
});

describe('siteVerdictLevel', () => {
  it('ok for a clean https page', () => {
    expect(siteVerdictLevel(https())).toBe('ok');
  });
  it('ok for http on loopback (a dev server)', () => {
    expect(siteVerdictLevel(emptySiteVerdict('http://localhost:5173/'))).toBe('ok');
  });
  it('caution for remote http, mixed content, a lookalike, a vulnerable lib or an insecure form', () => {
    expect(siteVerdictLevel(emptySiteVerdict('http://example.com/'))).toBe('caution');
    expect(siteVerdictLevel(https({ mixedContent: true, mixedContentUrls: ['http://x/i.png'] }))).toBe('caution');
    expect(siteVerdictLevel(https({ lookalike: { kind: 'confusable', displayHost: 'paypa1.com', against: 'paypal.com' } }))).toBe('caution');
    expect(siteVerdictLevel(https({ vulnerableLibs: [{ library: 'jquery', version: '1.12.4', cve: ['CVE-2020-11022'], url: 'x' }] }))).toBe('caution');
    expect(siteVerdictLevel(https({ insecureForm: true }))).toBe('caution');
  });
  it('danger for a TLS error or a known-bad hit', () => {
    expect(siteVerdictLevel(https({ tls: 'error', bypassed: true }))).toBe('danger');
    expect(siteVerdictLevel(https({ knownBad: { feed: 'urlhaus', category: 'malware', match: 'example.com' } }))).toBe('danger');
  });
  it('blocked trackers never raise the level', () => {
    expect(siteVerdictLevel(https({ trackersBlocked: 12 }))).toBe('ok');
  });
});

describe('siteVerdictLines', () => {
  it('says "no reputation data" with every feed off (acceptance)', () => {
    expect(siteVerdictLines(https()).at(-1)?.text).toMatch(/No reputation data/);
  });
  it('lists the CVEs of a vulnerable library', () => {
    const lines = siteVerdictLines(
      https({ vulnerableLibs: [{ library: 'jquery', version: '1.12.4', cve: ['CVE-2020-11023', 'CVE-2020-11022'], url: 'x' }] }),
    );
    expect(lines.map((l) => l.text)).toContain('jquery 1.12.4 has known vulnerabilities: CVE-2020-11023, CVE-2020-11022');
  });
  it('puts danger before caution before ok', () => {
    const lines = siteVerdictLines(
      https({ tls: 'error', bypassed: true, mixedContent: true, mixedContentUrls: ['a'], trackersBlocked: 1, reputation: 'checked' }),
    );
    expect(lines.map((l) => l.level)).toEqual(['danger', 'caution', 'ok', 'ok']);
  });
});

describe('verdict event arm', () => {
  it('parses through BrowserEventSchema', () => {
    const event = { kind: 'verdict', tabId: 't1', verdict: https() };
    expect(BrowserEventSchema.parse(event)).toEqual(event);
  });
});
