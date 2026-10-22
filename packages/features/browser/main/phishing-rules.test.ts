import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMONLY_IMPERSONATED_HOSTS,
  emptySiteVerdict,
  findLookalike,
  siteVerdictLevel,
  type SiteVerdict,
} from '@midnite/studio-shared';

import { fixture, loadPage, resetPage, runSnippet } from './fixtures/phishing/fixture-page';
import { brandClaim, brandOf, judgeCredentialRisk, type CredentialRiskInput } from './phishing-rules';

const SIGN_IN = [...COMMONLY_IMPERSONATED_HOSTS, 'open.spotify.com', 'calendar.google.com', 'youtube.com'];

function judge(partial: Partial<CredentialRiskInput> & { url: string }) {
  return judgeCredentialRisk({
    read: { hasPasswordField: true, formActionOrigins: [] },
    lookalike: null,
    firstSeenToday: false,
    signInHosts: SIGN_IN,
    ...partial,
  });
}

const rules = (r: ReturnType<typeof judge>) => r.risk?.reasons.map((reason) => reason.rule) ?? [];

describe('judgeCredentialRisk — the five rules', () => {
  it('fires nothing without a password field, whatever else is wrong', () => {
    const r = judge({
      url: 'http://g1thub.com/',
      read: { hasPasswordField: false, formActionOrigins: ['https://evil.example'] },
      lookalike: { kind: 'confusable', displayHost: 'g1thub.com', against: 'github.com' },
      firstSeenToday: true,
    });
    expect(r).toEqual({ risk: null, insecureForm: false });
  });

  it('(1) http page: caution, and marks the form insecure', () => {
    const r = judge({ url: 'http://members.example/login' });
    expect(r.risk).toEqual({ level: 'caution', reasons: [{ rule: 'http-password' }] });
    expect(r.insecureForm).toBe(true);
  });

  it('(1) loopback http is exempt — it never leaves the Mac', () => {
    expect(judge({ url: 'http://localhost:5173/login', firstSeenToday: true }).risk).toBeNull();
    expect(judge({ url: 'http://127.0.0.1/login' }).risk).toBeNull();
  });

  it('(2) a lookalike host: danger, naming the site it imitates', () => {
    const r = judge({ url: 'https://g1thub.com/login', lookalike: { kind: 'confusable', displayHost: 'g1thub.com', against: 'github.com' } });
    expect(r.risk?.level).toBe('danger');
    expect(r.risk?.reasons).toContainEqual({ rule: 'lookalike', detail: 'github.com' });
  });

  it('(3) first seen today: caution — but never for a known sign-in host or its subdomains', () => {
    expect(judge({ url: 'https://new-shop.example/', firstSeenToday: true }).risk).toEqual({
      level: 'caution',
      reasons: [{ rule: 'first-seen' }],
    });
    expect(judge({ url: 'https://github.com/login', firstSeenToday: true }).risk).toBeNull();
    expect(judge({ url: 'https://accounts.google.com/', firstSeenToday: true }).risk).toBeNull();
    expect(judge({ url: 'https://new-shop.example/', firstSeenToday: false }).risk).toBeNull();
  });

  it('(4) a password form posting to another site: caution; another origin on the same site is fine', () => {
    const away = judge({ url: 'https://shop.example/', read: { hasPasswordField: true, formActionOrigins: ['https://collect.evil.net'] } });
    expect(away.risk?.reasons).toEqual([{ rule: 'cross-origin-action', detail: 'https://collect.evil.net' }]);
    const sso = judge({ url: 'https://www.shop.example/', read: { hasPasswordField: true, formActionOrigins: ['https://login.shop.example'] } });
    expect(sso.risk).toBeNull();
  });

  it('(4) a form posting to http: marks the form insecure even on an https page', () => {
    const r = judge({ url: 'https://shop.example/', read: { hasPasswordField: true, formActionOrigins: ['http://shop.example'] } });
    expect(r.insecureForm).toBe(true);
    expect(r.risk).toBeNull();
  });

  it('(5) a brand in a subdomain or a title alone is caution, not danger', () => {
    expect(judge({ url: 'https://gitlab.mycorp.com/users/sign_in' }).risk).toEqual({
      level: 'caution',
      reasons: [{ rule: 'brand-mention', detail: 'gitlab.com' }],
    });
    expect(judge({ url: 'https://sso.mycorp.com/', title: 'Sign in with Google' }).risk).toBeNull();
  });

  it('(5) "GitHub login on github-login.app": danger', () => {
    const r = judge({ url: 'https://github-login.app/', title: 'GitHub' });
    expect(r.risk).toEqual({ level: 'danger', reasons: [{ rule: 'sign-in-elsewhere', detail: 'github.com' }] });
  });

  it('(5) a Vault sign-in domain counts as a sign-in host', () => {
    expect(judge({ url: 'https://spotify-account-verify.net/' }).risk?.reasons).toEqual([
      { rule: 'sign-in-elsewhere', detail: 'open.spotify.com' },
    ]);
    expect(judge({ url: 'https://abc-portal.net/', signInHosts: ['abc.com'] }).risk).toBeNull(); // too short to be a claim
    expect(judge({ url: 'https://acmecorp-login.net/', signInHosts: ['acmecorp.com'] }).risk?.level).toBe('danger');
  });

  it('the worst rule sets the level, and every rule that fired is listed', () => {
    const r = judge({
      url: 'http://paypal-secure.example/',
      read: { hasPasswordField: true, formActionOrigins: ['https://drop.example.org'] },
      firstSeenToday: true,
    });
    expect(r.risk?.level).toBe('danger');
    expect(rules(r).sort()).toEqual(['cross-origin-action', 'first-seen', 'http-password', 'sign-in-elsewhere']);
  });
});

describe('brandClaim', () => {
  it.each([
    ['github-login.app', undefined, 'github.com'],
    ['secure.paypal-verify.net', undefined, 'paypal.com'],
    ['accounts-google.support', undefined, 'google.com'],
    ['spotify-account-verify.net', 'Spotify', 'open.spotify.com'],
  ])('%s (title %s) is a sign-in page elsewhere: %s (danger)', (host, title, expected) => {
    expect(brandClaim(host, title, SIGN_IN)).toEqual({ rule: 'sign-in-elsewhere', detail: expected });
  });

  it.each([
    // Self-hosted forges and enterprise tenants: the brand is real, just not on its own site.
    ['gitlab.mycorp.com', undefined, 'gitlab.com'],
    ['github.mycorp.com', undefined, 'github.com'],
    ['bitbucket.mycorp.com', undefined, 'bitbucket.org'],
    ['mycorp.ghe.com', 'Sign in to GitHub · GitHub', 'github.com'],
    ['phish.example', 'Sign in to GitHub', 'github.com'],
    ['phish.example', 'Log in · PayPal', 'paypal.com'],
    ['phish.example', 'Log into PayPal', 'paypal.com'],
  ])('%s (title %s) only mentions %s (caution)', (host, title, expected) => {
    expect(brandClaim(host, title, SIGN_IN)).toEqual({ rule: 'brand-mention', detail: expected });
  });

  it.each([
    ['github.com', 'Sign in to GitHub'],
    ['gist.github.com', undefined],
    ['google.de', 'Sign in – Google Accounts'],
    ['githubusercontent.com', undefined],
    ['blog.example', 'What GitHub taught us'], // a brand in a title that is not a sign-in page
    ['sso.mycorp.com', 'Sign in with Google'], // an SSO button names the provider, not the destination
    ['applefcu.org', 'Sign in | Apple Federal Credit Union'], // another company sharing a word
    ['live-scores.example', undefined], // generic word brands never count
    ['x-files.example', undefined], // nor brands under four letters
  ])('%s (title %s) claims nothing', (host, title) => {
    expect(brandClaim(host, title, SIGN_IN)).toBeNull();
  });

  it('brandOf takes the label before the suffix', () => {
    expect(brandOf('accounts.google.com')).toBe('google');
    expect(brandOf('www.example.co.uk')).toBe('example');
  });
});

/**
 * Phase 117 Theme F acceptance — the three fixtures produce caution / danger / nothing. Each runs the
 * real snippet over the fixture HTML, Theme C's lookalike rule over its host, these rules over both,
 * and `siteVerdictLevel` over the verdict the two make together — the badge's own reading.
 */
describe('acceptance fixtures', () => {
  afterEach(resetPage);

  function verdictFor(file: string, url: string, title: string, firstSeenToday: boolean): SiteVerdict {
    loadPage(fixture(file), url);
    const host = new URL(url).hostname;
    const lookalike = findLookalike(host, COMMONLY_IMPERSONATED_HOSTS);
    const judged = judgeCredentialRisk({ url, read: runSnippet(), title, lookalike, firstSeenToday, signInHosts: SIGN_IN });
    return { ...emptySiteVerdict(url), lookalike, credentialRisk: judged.risk, insecureForm: judged.insecureForm };
  }

  it('a password form on http:// raises caution', () => {
    const verdict = verdictFor('http-login.html', 'http://members.example/login', 'Members area — sign in', false);
    expect(siteVerdictLevel(verdict)).toBe('caution');
    expect(verdict.credentialRisk?.reasons.map((r) => r.rule)).toEqual(['http-password']);
    expect(verdict.insecureForm).toBe(true);
  });

  it('a host that confuses with a known sign-in domain raises danger', () => {
    const verdict = verdictFor('github-confusable.html', 'https://g1thub.com/login', 'Sign in to GitHub · GitHub', false);
    expect(siteVerdictLevel(verdict)).toBe('danger');
    expect(verdict.credentialRisk?.reasons).toContainEqual({ rule: 'lookalike', detail: 'github.com' });
  });

  it('"GitHub login on github-login.app" raises danger', () => {
    const verdict = verdictFor('github-login-app.html', 'https://github-login.app/', 'GitHub', true);
    expect(siteVerdictLevel(verdict)).toBe('danger');
    expect(verdict.credentialRisk?.reasons.map((r) => r.rule).sort()).toEqual(['cross-origin-action', 'first-seen', 'sign-in-elsewhere']);
  });

  it('https://github.com raises nothing — even on a first visit', () => {
    const verdict = verdictFor('github-real.html', 'https://github.com/login', 'Sign in to GitHub · GitHub', true);
    expect(verdict.credentialRisk).toBeNull();
    expect(siteVerdictLevel(verdict)).toBe('ok');
  });
});
