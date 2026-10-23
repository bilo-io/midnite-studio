import { describe, expect, it } from 'vitest';

import { emptySiteVerdict, siteVerdictLevel, type SiteVerdict } from '@midnite/studio-shared';

import { siteBadgeLabel } from './site-badge';

/**
 * The badge's wording is read off the same `SiteVerdict` as its level (Phase 117 Theme C/F), so the
 * two must agree: a chip with a label is never `ok`, and `ok` never carries one.
 */
const https = (patch: Partial<SiteVerdict> = {}): SiteVerdict => ({
  ...emptySiteVerdict('https://example.com/'),
  ...patch,
});

describe('siteBadgeLabel', () => {
  it('is null for a clean https page and for loopback http', () => {
    expect(siteBadgeLabel(https())).toBeNull();
    expect(siteBadgeLabel(emptySiteVerdict('http://localhost:5173/'))).toBeNull();
    expect(siteVerdictLevel(emptySiteVerdict('http://127.0.0.1:3000/'))).toBe('ok');
  });

  it('names plain http as Not secure', () => {
    expect(siteBadgeLabel(emptySiteVerdict('http://example.com/'))).toBe('Not secure');
  });

  it.each<[string, Partial<SiteVerdict>, string]>([
    ['mixed content', { mixedContent: true }, 'Mixed content'],
    ['an insecure form', { insecureForm: true }, 'Insecure form'],
    ['a lookalike host', { lookalike: { kind: 'confusable', displayHost: 'xn--x', against: 'github.com' } }, 'Lookalike'],
    ['a caution login risk', { credentialRisk: { level: 'caution', reasons: [{ rule: 'first-seen' }] } }, 'Login risk'],
  ])('names %s at caution', (_name, patch, label) => {
    const verdict = https(patch);
    expect(siteVerdictLevel(verdict)).toBe('caution');
    expect(siteBadgeLabel(verdict)).toBe(label);
  });

  it('names a certificate failure and a feed hit at danger', () => {
    const tls = https({ tls: 'error', tlsError: 'net::ERR_CERT_DATE_INVALID' });
    expect(siteVerdictLevel(tls)).toBe('danger');
    expect(siteBadgeLabel(tls)).toBe('Certificate error');

    const bad = https({ knownBad: { feed: 'urlhaus', category: 'malware', match: 'example.com' } });
    expect(siteVerdictLevel(bad)).toBe('danger');
    expect(siteBadgeLabel(bad)).toBe('Dangerous site');
  });

  it('calls a danger-level credential risk Possible phishing', () => {
    const verdict = https({ credentialRisk: { level: 'danger', reasons: [{ rule: 'lookalike' }] } });
    expect(siteBadgeLabel(verdict)).toBe('Possible phishing');
  });
});
