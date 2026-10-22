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

describe('credentialRisk (Phase 117 Theme F)', () => {
  it('starts null and validates on the wire', () => {
    expect(emptySiteVerdict('https://example.com').credentialRisk).toBeNull();
    const risky = https({ credentialRisk: { level: 'danger', reasons: [{ rule: 'sign-in-elsewhere', detail: 'github.com' }] } });
    expect(SiteVerdictSchema.parse(risky)).toEqual(risky);
    expect(() => SiteVerdictSchema.parse(https({ credentialRisk: { level: 'caution', reasons: [] } }))).toThrow();
  });

  it('raises the badge to its own level', () => {
    expect(siteVerdictLevel(https({ credentialRisk: { level: 'caution', reasons: [{ rule: 'first-seen' }] } }))).toBe('caution');
    expect(siteVerdictLevel(https({ credentialRisk: { level: 'danger', reasons: [{ rule: 'lookalike', detail: 'github.com' }] } }))).toBe('danger');
  });

  it('adds one popover line per rule, worst first', () => {
    const lines = siteVerdictLines(
      https({
        credentialRisk: {
          level: 'danger',
          reasons: [
            { rule: 'cross-origin-action', detail: 'https://drop.example' },
            { rule: 'sign-in-elsewhere', detail: 'github.com' },
          ],
        },
      }),
    );
    expect(lines[0]).toEqual({ level: 'danger', text: 'Looks like a github.com sign-in page, but is not on github.com' });
    expect(lines).toContainEqual({ level: 'caution', text: 'Sends the password to another site (https://drop.example)' });
  });

  it('a brand mention alone is caution, never danger', () => {
    const v = https({ credentialRisk: { level: 'caution', reasons: [{ rule: 'brand-mention', detail: 'gitlab.com' }] } });
    expect(siteVerdictLevel(v)).toBe('caution');
    expect(siteVerdictLines(v)[0]).toEqual({ level: 'caution', text: 'Mentions gitlab.com on a sign-in page that is not gitlab.com' });
  });
});

describe('credentialRisk lines do not repeat the insecure-form line', () => {
  it('drops the generic insecure-form row when the http-password rule already says it', () => {
    const v: SiteVerdict = {
      ...emptySiteVerdict('http://members.example/'),
      insecureForm: true,
      credentialRisk: { level: 'caution', reasons: [{ rule: 'http-password' }] },
    };
    const texts = siteVerdictLines(v).map((l) => l.text);
    expect(texts).toContain('Asks for a password over an unencrypted connection');
    expect(texts).not.toContain('This page sends data over an unencrypted connection');
    expect(siteVerdictLines({ ...v, credentialRisk: null }).map((l) => l.text)).toContain('This page sends data over an unencrypted connection');
  });
});
