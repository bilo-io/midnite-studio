import { z } from 'zod';

/**
 * What the Browser app knows about the site a tab is showing (Phase 117 Theme C).
 *
 * Main builds one per tab — fresh on every main-frame navigation commit, then patched as the page
 * loads (a mixed-content image, a vulnerable script, a tracker Theme E blocked) — and pushes it on
 * the browser event channel as `{ kind: 'verdict', tabId, verdict }`. The renderer only renders it:
 * {@link siteVerdictLevel} picks the badge state and {@link siteVerdictLines} the popover rows, both
 * pure so the badge, the interstitial and Theme F's phishing rules agree on one reading.
 *
 * Local rules first (TLS, mixed content, IDN/lookalike, insecure form, library signatures) — they
 * cost nothing and need no network. Reputation feeds second, and only behind their own switch:
 * with every feed off, `reputation` is `'unavailable'` and the popover says so rather than implying
 * a clean bill of health.
 */

export const SiteVerdictLevelSchema = z.enum(['ok', 'caution', 'danger']);
export type SiteVerdictLevel = z.infer<typeof SiteVerdictLevelSchema>;

export const SiteLookalikeSchema = z.object({
  kind: z.enum(['idn-mixed-script', 'confusable']),
  /** How the host is displayed — punycode whenever a lookalike rule fired. */
  displayHost: z.string(),
  /** The known host it impersonates, when one matched. */
  against: z.string().optional(),
});
export type SiteLookalike = z.infer<typeof SiteLookalikeSchema>;

/** The open reputation feeds (Decision 2) — each a Phase 115 egress entry with its own switch. */
export const SiteFeedIdSchema = z.enum(['urlhaus', 'openphish']);
export type SiteFeedId = z.infer<typeof SiteFeedIdSchema>;

export const SiteKnownBadSchema = z.object({
  feed: SiteFeedIdSchema,
  /** `'malware'` (URLhaus) or `'phishing'` (OpenPhish). */
  category: z.string(),
  /** The feed entry that matched — a host or a URL prefix. */
  match: z.string(),
});
export type SiteKnownBad = z.infer<typeof SiteKnownBadSchema>;

export const VulnerableLibrarySchema = z.object({
  library: z.string(),
  version: z.string(),
  /** CVE (or GHSA, where no CVE was assigned) identifiers, newest first. */
  cve: z.array(z.string()),
  /** The script URL it was recognised from. */
  url: z.string(),
});
export type VulnerableLibrary = z.infer<typeof VulnerableLibrarySchema>;

/**
 * Theme F's credential-phishing rules, each fired only when the page shows a password field
 * (read main-side, in an isolated world — see `login-form-read.ts` in the browser feature).
 *
 * - `http-password` — the field is on a plain-`http:` page (caution).
 * - `lookalike` — the host is a lookalike (Theme C's rule) of a site the user knows (danger).
 * - `first-seen` — the host was first seen today and has no history (caution).
 * - `cross-origin-action` — the field's form posts to another origin (caution).
 * - `sign-in-elsewhere` — the page's own site name carries a known sign-in brand on a site that is
 *   not that brand's: "GitHub login on `github-login.app`" (danger).
 * - `brand-mention` — a known sign-in brand appears only in a subdomain (`gitlab.mycorp.com`) or in
 *   a sign-in title ("Sign in to GitHub") on another site (caution — self-hosted forges and SSO
 *   pages look exactly like this, so it never reaches danger alone).
 */
export const CredentialRuleSchema = z.enum([
  'http-password',
  'lookalike',
  'first-seen',
  'cross-origin-action',
  'sign-in-elsewhere',
  'brand-mention',
]);
export type CredentialRule = z.infer<typeof CredentialRuleSchema>;

export const SiteCredentialRiskSchema = z.object({
  level: z.enum(['caution', 'danger']),
  reasons: z
    .array(
      z.object({
        rule: CredentialRuleSchema,
        /** What the rule matched against, e.g. the impersonated host or the form's target origin. */
        detail: z.string().optional(),
      }),
    )
    .min(1),
});
export type SiteCredentialRisk = z.infer<typeof SiteCredentialRiskSchema>;

/** Caps keep a verdict small on the wire however noisy the page is. */
export const SITE_VERDICT_URL_CAP = 20;
export const SITE_VERDICT_TRACKER_HOST_CAP = 50;

export const SiteVerdictSchema = z.object({
  /** `scheme://host[:port]` of the main frame, or `''` for a non-web page. */
  origin: z.string(),
  /** The host as the address bar shows it (punycode for a lookalike, see `lookalike.ts`). */
  displayHost: z.string(),
  /** `'none'` for plain `http:`; `'error'` when verification failed (only reachable past a bypass). */
  tls: z.enum(['ok', 'error', 'none']),
  /** Chromium's error name for a failed verification, e.g. `net::ERR_CERT_DATE_INVALID`. */
  tlsError: z.string().optional(),
  /** The user proceeded past this site's interstitial for the session. */
  bypassed: z.boolean(),
  /** An `http:` subresource loaded under an `https:` main frame (passive content — active is blocked). */
  mixedContent: z.boolean(),
  mixedContentUrls: z.array(z.string()).max(SITE_VERDICT_URL_CAP),
  lookalike: SiteLookalikeSchema.nullable(),
  knownBad: SiteKnownBadSchema.nullable(),
  /** `'unavailable'` while every reputation feed is switched off (or none has been pulled yet). */
  reputation: z.enum(['checked', 'unavailable']),
  vulnerableLibs: z.array(VulnerableLibrarySchema),
  /**
   * The page sent data somewhere it can be read in transit. Theme C sets it when a non-GET
   * subresource request goes to a non-loopback `http:` URL; Theme F also sets it from its
   * login-form read (a password field on `http:`, or a form posting to `http:`).
   */
  insecureForm: z.boolean(),
  /** Theme F: a password field on this page fired one or more credential-phishing rules. */
  credentialRisk: SiteCredentialRiskSchema.nullable(),
  /** Requests Theme E's blocklist refused on this page — the badge's counter. */
  trackersBlocked: z.number().int().nonnegative(),
  trackerHosts: z.array(z.string()).max(SITE_VERDICT_TRACKER_HOST_CAP),
});
export type SiteVerdict = z.infer<typeof SiteVerdictSchema>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** `localhost`, `*.localhost`, `127.x.x.x` and `::1` — a secure context even over `http:`. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return LOOPBACK_HOSTS.has(h) || h.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** The verdict a tab starts each navigation with — every finding empty, nothing judged yet. */
export function emptySiteVerdict(url: string): SiteVerdict {
  let origin = '';
  let host = '';
  let tls: SiteVerdict['tls'] = 'none';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      origin = parsed.origin;
      host = parsed.hostname;
      tls = parsed.protocol === 'https:' ? 'ok' : 'none';
    }
  } catch {
    // Not a URL — leave the verdict blank.
  }
  return {
    origin,
    displayHost: host,
    tls,
    bypassed: false,
    mixedContent: false,
    mixedContentUrls: [],
    lookalike: null,
    knownBad: null,
    reputation: 'unavailable',
    vulnerableLibs: [],
    insecureForm: false,
    credentialRisk: null,
    trackersBlocked: 0,
    trackerHosts: [],
  };
}

function hostOfOrigin(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

/** Plain `http:` to something other than this Mac. */
function isInsecureTransport(verdict: SiteVerdict): boolean {
  return verdict.tls === 'none' && verdict.origin.startsWith('http:') && !isLoopbackHost(hostOfOrigin(verdict.origin));
}

/**
 * The badge's state. **danger**: a TLS failure or a known-bad feed hit (both interstitial
 * reasons, so a verdict carrying one is only ever seen past a bypass), or a password field Theme F
 * judged a likely phish (no interstitial — the page is already showing). **caution**: anything else
 * a careful user would want to know before typing into the page. Theme E's tracker count never
 * raises the level — blocked trackers are the protection working, not a finding.
 */
export function siteVerdictLevel(verdict: SiteVerdict): SiteVerdictLevel {
  if (verdict.tls === 'error' || verdict.knownBad || verdict.credentialRisk?.level === 'danger') return 'danger';
  if (
    verdict.credentialRisk ||
    verdict.lookalike ||
    verdict.mixedContent ||
    verdict.vulnerableLibs.length > 0 ||
    verdict.insecureForm ||
    isInsecureTransport(verdict)
  ) {
    return 'caution';
  }
  return 'ok';
}

export type SiteVerdictLine = { level: SiteVerdictLevel; text: string };

/** The level each credential rule carries on its own — the risk's level is the worst of them. */
export const CREDENTIAL_RULE_LEVEL: Readonly<Record<CredentialRule, 'caution' | 'danger'>> = {
  'http-password': 'caution',
  lookalike: 'danger',
  'first-seen': 'caution',
  'cross-origin-action': 'caution',
  'sign-in-elsewhere': 'danger',
  'brand-mention': 'caution',
};

function credentialLine(rule: CredentialRule, detail: string | undefined): SiteVerdictLine {
  const level = CREDENTIAL_RULE_LEVEL[rule];
  switch (rule) {
    case 'http-password':
      return { level, text: 'Asks for a password over an unencrypted connection' };
    case 'lookalike':
      return { level, text: `Asks for a password on an address that imitates ${detail ?? 'a site you know'}` };
    case 'first-seen':
      return { level, text: 'Asks for a password on a site first seen today' };
    case 'cross-origin-action':
      return { level, text: `Sends the password to another site${detail ? ` (${detail})` : ''}` };
    case 'sign-in-elsewhere':
      return { level, text: `Looks like a ${detail ?? 'known'} sign-in page, but is not on ${detail ?? 'that site'}` };
    case 'brand-mention':
      return { level, text: `Mentions ${detail ?? 'a known site'} on a sign-in page that is not ${detail ?? 'that site'}` };
  }
}

/** The popover's rows, worst first. Always ends with the reputation line. */
export function siteVerdictLines(verdict: SiteVerdict): SiteVerdictLine[] {
  const lines: SiteVerdictLine[] = [];
  if (verdict.tls === 'error') {
    lines.push({
      level: 'danger',
      text: `Certificate not valid${verdict.tlsError ? ` (${verdict.tlsError})` : ''}${verdict.bypassed ? ' — you proceeded anyway' : ''}`,
    });
  }
  if (verdict.knownBad) {
    const what = verdict.knownBad.category === 'phishing' ? 'phishing' : 'malware';
    lines.push({
      level: 'danger',
      text: `Listed as ${what} by ${verdict.knownBad.feed === 'urlhaus' ? 'URLhaus' : 'OpenPhish'}${verdict.bypassed ? ' — you proceeded anyway' : ''}`,
    });
  }
  for (const reason of verdict.credentialRisk?.reasons ?? []) lines.push(credentialLine(reason.rule, reason.detail));
  if (verdict.lookalike) {
    const against = verdict.lookalike.against ? ` — looks like ${verdict.lookalike.against}` : '';
    lines.push({
      level: 'caution',
      text:
        verdict.lookalike.kind === 'idn-mixed-script'
          ? `Address mixes alphabets (${verdict.lookalike.displayHost})${against}`
          : `Address resembles a site you know (${verdict.lookalike.displayHost})${against}`,
    });
  }
  if (isInsecureTransport(verdict)) lines.push({ level: 'caution', text: 'Connection is not encrypted (http)' });
  // Theme F's own line already says it when the insecure form is a password field on http.
  const passwordOverHttp = verdict.credentialRisk?.reasons.some((r) => r.rule === 'http-password') ?? false;
  if (verdict.insecureForm && !passwordOverHttp) {
    lines.push({ level: 'caution', text: 'This page sends data over an unencrypted connection' });
  }
  if (verdict.mixedContent) {
    const n = verdict.mixedContentUrls.length;
    lines.push({ level: 'caution', text: `Loads ${n === 1 ? 'an insecure resource' : `${n} insecure resources`} (mixed content)` });
  }
  for (const lib of verdict.vulnerableLibs) {
    lines.push({ level: 'caution', text: `${lib.library} ${lib.version} has known vulnerabilities: ${lib.cve.join(', ')}` });
  }
  if (verdict.trackersBlocked > 0) {
    lines.push({
      level: 'ok',
      text: `${verdict.trackersBlocked} tracker request${verdict.trackersBlocked === 1 ? '' : 's'} blocked`,
    });
  }
  if (verdict.tls === 'ok' && !verdict.bypassed) lines.push({ level: 'ok', text: 'Connection is secure' });
  lines.push(
    verdict.reputation === 'unavailable'
      ? { level: 'ok', text: 'No reputation data (feeds are off in Settings ▸ Privacy)' }
      : verdict.knownBad
        ? { level: 'danger', text: 'Checked against reputation feeds' }
        : { level: 'ok', text: 'Not on any reputation feed' },
  );
  const rank: Record<SiteVerdictLevel, number> = { danger: 0, caution: 1, ok: 2 };
  return lines.map((line, index) => ({ line, index }))
    .sort((a, b) => rank[a.line.level] - rank[b.line.level] || a.index - b.index)
    .map(({ line }) => line);
}
