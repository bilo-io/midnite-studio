import {
  CREDENTIAL_RULE_LEVEL,
  isLoopbackHost,
  type CredentialRule,
  type SiteCredentialRisk,
  type SiteLookalike,
} from '@midnite/studio-shared';

import { registrableDomain } from './browser-request-filter';
import type { LoginFormRead } from './login-form-read';

/**
 * Theme F's credential-phishing rules (Phase 117) — pure, so every rule is a table test.
 *
 * Nothing fires without a password field: the rules judge "is this a place to type a password",
 * not the site in general (Theme C's verdict already does that). Each rule carries its own level
 * (`CREDENTIAL_RULE_LEVEL`, in `shared`); the risk's level is the worst of the ones that fired.
 *
 * 1. **`http-password`** — the page is plain `http:` (loopback excepted: it never leaves the Mac).
 * 2. **`lookalike`** — Theme C's lookalike rule already fired for this host; a password field on it
 *    is the payoff that rule exists to stop, so it rises from caution to danger.
 * 3. **`first-seen`** — the host was first reached today (see `host-first-seen.ts`) and is not a
 *    site the app already knows as a sign-in host.
 * 4. **`cross-origin-action`** — a form holding the password field posts to another *site*
 *    (registrable domain). Judged per site rather than per origin on purpose: `www.example.com`
 *    posting to `login.example.com` is how every single-sign-on subdomain works, while a phishing
 *    kit posts to a host it controls.
 * 5. **`sign-in-elsewhere`** / **`brand-mention`** — the page claims a known sign-in site's brand on
 *    a host that is not that site: in its own site label (`github-login.app` — danger), or only in
 *    a subdomain or a sign-in title (`gitlab.mycorp.com`, "Sign in to GitHub" — caution). This is
 *    the one that catches "GitHub login on `github-login.app`", which no skeleton rule can — the
 *    host is not a confusable of anything. See {@link brandClaim}.
 */

export type CredentialRiskInput = {
  url: string;
  read: LoginFormRead;
  /** The page title (`webContents.getTitle()`); optional — the host rule stands alone. */
  title?: string;
  /** Theme C's lookalike finding for this commit, if any. */
  lookalike: SiteLookalike | null;
  /** The host was first seen today. */
  firstSeenToday: boolean;
  /** Hosts the app knows people sign in to: the impersonation seed, the web apps, the Vault's sign-ins. */
  signInHosts: Iterable<string>;
};

/** Brands too generic to read as a claim on their own — "live", "office" and "slack" are words too. */
const GENERIC_BRANDS = new Set(['live', 'office', 'outlook', 'slack', 'notion', 'stripe', 'open', 'accounts', 'login', 'mail']);

/** A brand needs this many letters before it counts as a claim — `x` (x.com) never does. */
const MIN_BRAND_LENGTH = 4;

const SIGN_IN_TITLE = /\b(sign[\s-]?in(?:to)?|log[\s-]?into|log[\s-]?in|signin|login|log on|sign on|password|verify (your )?account)\b/i;

/** "Sign in to GitHub", "Log into PayPal" — the brand a sign-in title names as its destination. */
const SIGN_IN_TO = /\b(?:(?:sign|log)[\s-]?(?:in|on)\s+to|(?:sign|log)\s+into)\s+(?:your\s+)?([a-z0-9]+)/i;

/** "Log in · PayPal", "GitHub | Sign in" — a title segment that is the brand name alone. */
const TITLE_SEPARATOR = /\s+[-–—:]\s+|\s*[|·•]\s*/;

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** `accounts.google.com` → `google`; `example.co.uk` → `example`. */
export function brandOf(host: string): string {
  return registrableDomain(stripWww(host.toLowerCase())).split('.')[0] ?? '';
}

const splitLabel = (label: string): string[] => label.split(/[-_]/).filter(Boolean);

/** The page's own site label's tokens (`github-login.app` → github, login) and its subdomains' tokens. */
function hostTokens(host: string): { site: Set<string>; subdomain: Set<string> } {
  const registrable = registrableDomain(host);
  const labels = host.split('.');
  const siteLabelIndex = labels.length - registrable.split('.').length;
  return {
    site: new Set(splitLabel(labels[siteLabelIndex] ?? '')),
    subdomain: new Set(labels.slice(0, Math.max(0, siteLabelIndex)).flatMap(splitLabel)),
  };
}

/**
 * The brands a sign-in-shaped title claims as its destination: the word after "sign in to", or a
 * separator-delimited segment that is a single word ("Log in · PayPal"). Never a brand that only
 * appears in passing — "Sign in with Google" (an SSO button) and "Sign in | Apple Federal Credit
 * Union" (another company that shares a word) claim nothing.
 */
function titleBrands(title: string | undefined): Set<string> {
  const brands = new Set<string>();
  if (!title || !SIGN_IN_TITLE.test(title)) return brands;
  const to = SIGN_IN_TO.exec(title);
  if (to?.[1]) brands.add(to[1].toLowerCase());
  for (const segment of title.split(TITLE_SEPARATOR)) {
    const word = segment.trim().toLowerCase();
    if (/^[a-z0-9]+$/.test(word)) brands.add(word);
  }
  return brands;
}

/** Is `host` that sign-in host, or a subdomain or parent of it? (`accounts.google.com` ~ `google.com`.) */
function sameFamily(host: string, known: string): boolean {
  return host === known || host.endsWith(`.${known}`) || known.endsWith(`.${host}`) || registrableDomain(host) === registrableDomain(known);
}

export type BrandClaim = { rule: 'sign-in-elsewhere' | 'brand-mention'; detail: string };

/**
 * Which known sign-in host this page claims to be without being it, and how strongly. Exported for tests.
 *
 * - **`sign-in-elsewhere` (danger)** — the brand is in the page's *own site label*
 *   (`github-login.app`, `secure.paypal-verify.net`): someone registered a name to carry it.
 * - **`brand-mention` (caution)** — the brand is only in a subdomain (`gitlab.mycorp.com`, a
 *   self-hosted forge) or only in the title ("Sign in to GitHub" on `mycorp.ghe.com`). Real
 *   deployments look exactly like this, so on its own it never refuses anything.
 *
 * A host on the brand's own name under another suffix (`google.de`, `paypal.co.uk`) claims nothing:
 * regional sites are real, and a squatter there is a lookalike/feed matter, not this rule's.
 */
export function brandClaim(host: string, title: string | undefined, signInHosts: Iterable<string>): BrandClaim | null {
  const page = stripWww(host.toLowerCase().replace(/\.$/, ''));
  const known = [...new Set([...signInHosts].map((h) => stripWww(h.toLowerCase().replace(/^\./, ''))).filter(Boolean))];
  if (known.some((k) => sameFamily(page, k))) return null;
  const pageBrand = brandOf(page);
  const tokens = hostTokens(page);
  const claimedInTitle = titleBrands(title);

  // Within each strength, the shortest host names the brand (`google.com` over `accounts.google.com`).
  const first = (has: (brand: string) => boolean): string | undefined =>
    known
      .filter((k) => {
        const brand = brandOf(k);
        return brand.length >= MIN_BRAND_LENGTH && !GENERIC_BRANDS.has(brand) && brand !== pageBrand && has(brand);
      })
      .sort((a, b) => a.length - b.length || a.localeCompare(b))[0];

  const onSite = first((brand) => tokens.site.has(brand));
  if (onSite) return { rule: 'sign-in-elsewhere', detail: onSite };
  const mentioned = first((brand) => tokens.subdomain.has(brand) || claimedInTitle.has(brand));
  return mentioned ? { rule: 'brand-mention', detail: mentioned } : null;
}

function originOf(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export type CredentialJudgement = {
  risk: SiteCredentialRisk | null;
  /** A password field on `http:`, or a password form posting to `http:` — Theme C's `insecureForm`. */
  insecureForm: boolean;
};

export function judgeCredentialRisk(input: CredentialRiskInput): CredentialJudgement {
  const page = originOf(input.url);
  if (!input.read.hasPasswordField || !page || (page.protocol !== 'http:' && page.protocol !== 'https:')) {
    return { risk: null, insecureForm: false };
  }
  const host = page.hostname.toLowerCase();
  if (isLoopbackHost(host)) return { risk: null, insecureForm: false };

  const reasons: Array<{ rule: CredentialRule; detail?: string }> = [];
  const httpPage = page.protocol === 'http:';
  if (httpPage) reasons.push({ rule: 'http-password' });

  if (input.lookalike) {
    reasons.push({ rule: 'lookalike', ...(input.lookalike.against ? { detail: input.lookalike.against } : {}) });
  }

  const claim = brandClaim(host, input.title, input.signInHosts);
  if (claim) reasons.push(claim);

  const known = [...input.signInHosts].map((h) => stripWww(h.toLowerCase()));
  if (input.firstSeenToday && !known.some((k) => sameFamily(stripWww(host), k))) reasons.push({ rule: 'first-seen' });

  let postsInsecurely = false;
  const pageSite = registrableDomain(host);
  for (const action of input.read.formActionOrigins) {
    const target = originOf(action);
    if (!target) continue;
    if (target.protocol === 'http:' && !isLoopbackHost(target.hostname)) postsInsecurely = true;
    if (registrableDomain(target.hostname.toLowerCase()) !== pageSite && !reasons.some((r) => r.rule === 'cross-origin-action')) {
      reasons.push({ rule: 'cross-origin-action', detail: target.origin });
    }
  }

  if (reasons.length === 0) return { risk: null, insecureForm: postsInsecurely };
  const level = reasons.some((r) => CREDENTIAL_RULE_LEVEL[r.rule] === 'danger') ? 'danger' : 'caution';
  return { risk: { level, reasons }, insecureForm: httpPage || postsInsecurely };
}
