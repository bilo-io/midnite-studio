import { describe, expect, it } from 'vitest';

import { hostMatchesDomain, parseUrlhausHosts, sitesCheck, type VisitedOrigin } from './sites';

const T = Date.UTC(2026, 10, 12, 9, 30);
const history: VisitedOrigin[] = [
  { origin: 'https://captcha-verify.example', visitedAt: T, tabId: 'tab-7' },
  { origin: 'http://old-portal.example', visitedAt: T, loginForm: true, serverHeaders: ['Apache/2.2.15 (CentOS)', 'PHP/5.6.40'] },
  { origin: 'https://github.com', visitedAt: T, serverHeaders: ['nginx/1.25.3'] },
  { origin: 'https://mirror.evil.example', visitedAt: T },
];
const feed = { clickfixDomains: ['captcha-verify.example'] };

describe('sites check', () => {
  it('flags a ClickFix domain, an http login, a phishing host and EOL headers, and nothing for a clean origin', () => {
    const f = sitesCheck.run({ history, threatFeed: feed, phishingHosts: ['evil.example'] }) as { fingerprint: string; severity: string; detail: string }[];
    expect(f.map((x) => [x.fingerprint, x.severity])).toEqual([
      ['sites:clickfix:captcha-verify.example', 'critical'],
      ['sites:http-login:old-portal.example', 'medium'],
      ['sites:eol:old-portal.example:Apache 2.2 or older', 'low'],
      ['sites:eol:old-portal.example:PHP before 8.0', 'low'],
      ['sites:phishing:mirror.evil.example', 'critical'],
    ]);
    expect(f[0]!.detail).toContain('tab-7');
  });

  it('still runs the local rules with both feeds off', () => {
    const f = sitesCheck.run({ history }) as { fingerprint: string }[];
    expect(f.map((x) => x.fingerprint)).toContain('sites:http-login:old-portal.example');
    expect(f.some((x) => x.fingerprint.includes('clickfix'))).toBe(false);
  });

  it('a clean history yields nothing', () => {
    expect(sitesCheck.run({ history: [{ origin: 'https://example.com', visitedAt: T }], threatFeed: feed })).toEqual([]);
    expect(sitesCheck.run({ history: [] })).toEqual([]);
  });

  it('matches subdomains but not look-alikes', () => {
    expect(hostMatchesDomain('a.b.evil.example', 'evil.example')).toBe(true);
    expect(hostMatchesDomain('notevil.example', 'evil.example')).toBe(false);
  });

  it('parses a captured URLhaus export into hosts', () => {
    const csv = ['# URLhaus', '# id,dateadded,url,url_status', '"1","2026-11-01","http://bad.example/x.exe","online"', '"2","2026-11-01","not a url","online"', 'https://other.example/p'].join('\n');
    expect(parseUrlhausHosts(csv)).toEqual(['bad.example', 'other.example']);
  });
});
