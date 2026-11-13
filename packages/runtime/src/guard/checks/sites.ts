import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const SITES_CHECK_ID = 'sites';

/** One origin the browser visited in the sweep window. Origins only: no paths, queries or page content. */
export interface VisitedOrigin {
  origin: string;
  visitedAt: number;
  /** The tab it is still open in, when it is. */
  tabId?: string;
  /** The browser's sign-in detection saw a login form on this origin. */
  loginForm?: boolean;
  /** The `Server` / `X-Powered-By` response headers it announced, captured by the browser's response hook. */
  serverHeaders?: string[];
}

/** The slice of the signed threat feed this check reads. */
export interface SitesThreatFeed {
  clickfixDomains?: string[];
}

/** Server and framework versions past their vendor's end of life; each rule is one announced header value. */
export const END_OF_LIFE_HEADERS: readonly { re: RegExp; name: string }[] = [
  { re: /PHP\/[0-7]\.\d/i, name: 'PHP before 8.0' },
  { re: /Apache\/2\.[0-3]\./i, name: 'Apache 2.2 or older' },
  { re: /nginx\/1\.(?:\d|1[0-7])\./i, name: 'nginx before 1.18' },
  { re: /Microsoft-IIS\/[1-7]\./i, name: 'IIS 7 or older' },
  { re: /ASP\.NET\s*[1-3]\./i, name: 'ASP.NET 3 or older' },
];

/** The host of an origin, lower-cased; null when it is not a parseable URL. */
export function originHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** `host` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  return d !== '' && (host === d || host.endsWith(`.${d}`));
}

/** Shared platforms URLhaus lists individual URLs on; flagging the whole host would false-positive on every visit. */
export const SHARED_HOSTS: readonly string[] = [
  'github.com', 'githubusercontent.com', 'gitlab.com', 'google.com', 'googleusercontent.com', 'dropbox.com', 'dropboxusercontent.com',
  'onedrive.live.com', 'sharepoint.com', 'amazonaws.com', 'cloudfront.net', 'discord.com', 'discordapp.com', 'telegram.org', 'mediafire.com',
  'bitbucket.org', 'sourceforge.net', 'pastebin.com', 'cdn.jsdelivr.net', 'npmjs.com', 'pypi.org',
];

/**
 * Hosts out of a URLhaus text/CSV export (CC0): each non-comment line carries a quoted URL; only its host is kept.
 * Shared platforms ({@link SHARED_HOSTS}) and anything unparseable are skipped.
 */
export function parseUrlhausHosts(text: string): string[] {
  const hosts = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (line === '' || line.startsWith('#')) continue;
    const url = /"(https?:\/\/[^"]+)"/.exec(line)?.[1] ?? (/^https?:\/\/\S+$/.test(line.trim()) ? line.trim() : undefined);
    const host = url ? originHost(url) : null;
    if (host && !SHARED_HOSTS.some((d) => hostMatchesDomain(host, d))) hosts.add(host);
  }
  return [...hosts];
}

const when = (t: number): string => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Theme E, sites the browser visited, checked offline: an origin on the threat feed's `clickfixDomains` (`critical`),
 * an `http:` origin that served a login form (`medium`), an origin on a malware feed (`high`) and a response
 * header that announced an end-of-life stack (`low`). The feeds are optional inputs, so with them off the local
 * parts still run. The fix is text ("open it", "forget it"): the tab and forget-origin actions arrive with Theme G.
 */
export const sitesCheck: GuardCheck = {
  id: SITES_CHECK_ID,
  title: 'Sites the browser visited',
  category: 'site',
  needs: ['history', 'threatFeed', 'phishingHosts'],
  optional: ['threatFeed', 'phishingHosts'],
  run(raw): SecurityFinding[] {
    const inputs = raw as { history?: VisitedOrigin[]; threatFeed?: SitesThreatFeed; phishingHosts?: string[] };
    const history = Array.isArray(inputs.history) ? inputs.history : [];
    const clickfix = inputs.threatFeed?.clickfixDomains ?? [];
    const phishing = inputs.phishingHosts ?? [];
    const findings: SecurityFinding[] = [];
    const seen = new Set<string>();
    const add = (subject: string, make: () => SecurityFinding): void => {
      if (seen.has(subject)) return;
      seen.add(subject);
      findings.push(make());
    };
    for (const v of history) {
      const host = originHost(v.origin);
      if (!host) continue;
      const tab = v.tabId ? ` It is still open in tab ${v.tabId}.` : '';
      const base = { check: sitesCheck, evidence: [{ kind: 'host' as const, host, protocol: new URL(v.origin).protocol.replace(':', '') }] };
      const hit = clickfix.find((d) => hostMatchesDomain(host, d));
      if (hit) {
        add(`clickfix:${host}`, () =>
          createGuardFinding({
            ...base,
            subject: `clickfix:${host}`,
            severity: 'critical',
            title: `Visited ${host}, a known ClickFix domain`,
            detail: `${host} matches ${hit} on the threat feed's ClickFix list (visited ${when(v.visitedAt)}).${tab} If it asked you to paste or run a command, do not, and treat the Mac as exposed.`,
            firstSeen: v.visitedAt,
          }),
        );
      }
      if (phishing.some((d) => hostMatchesDomain(host, d))) {
        add(`phishing:${host}`, () =>
          createGuardFinding({
            ...base,
            subject: `phishing:${host}`,
            severity: 'high',
            title: `Visited ${host}, listed as serving malware`,
            detail: `${host} is on the URLhaus feed of hosts serving malware URLs (visited ${when(v.visitedAt)}); a listing can cover one path, not the whole site.${tab}`,
            firstSeen: v.visitedAt,
          }),
        );
      }
      if (v.loginForm && v.origin.startsWith('http:')) {
        add(`http-login:${host}`, () =>
          createGuardFinding({
            ...base,
            subject: `http-login:${host}`,
            severity: 'medium',
            title: `${host} showed a login form over plain HTTP`,
            detail: `Anything typed there crosses the network unencrypted (${when(v.visitedAt)}).${tab}`,
            firstSeen: v.visitedAt,
          }),
        );
      }
      for (const header of v.serverHeaders ?? []) {
        const eol = END_OF_LIFE_HEADERS.find((r) => r.re.test(header));
        if (!eol) continue;
        add(`eol:${host}:${eol.name}`, () =>
          createGuardFinding({
            ...base,
            subject: `eol:${host}:${eol.name}`,
            severity: 'low',
            title: `${host} announces an end-of-life stack (${eol.name})`,
            detail: `Its response header says "${header.slice(0, 80)}". The site is not patched; avoid giving it anything sensitive.`,
            firstSeen: v.visitedAt,
          }),
        );
      }
    }
    return findings;
  },
};
