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
 * 5. **`sign-in-elsewhere`** — the page claims a known sign-in site's brand, in its own host's
 *    labels (`github-login.app`, `secure.paypal-verify.net`) or in a sign-in-shaped title ("Sign
 *    in to GitHub"), on a host that is not that site. This is the one that catches "GitHub login
 *    on `github-login.app`", which no skeleton rule can — the host is not a confusable of anything.
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

const SIGN_IN_TITLE = /\b(sign[\s-]?in|log[\s-]?in|signin|login|log on|sign on|password|verify (your )?account)\b/i;

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** `accounts.google.com` → `google`; `example.co.uk` → `example`. */
export function brandOf(host: string): string {
  return registrableDomain(stripWww(host.toLowerCase())).split('.')[0] ?? '';
}

/** The host's labels outside its public suffix, split on `.`, `-` and `_`. */
function hostTokens(host: string): string[] {
  const registrable = registrableDomain(host);
  const suffixParts = registrable.split('.').length - 1;
  const labels = host.split('.');
  return labels
    .slice(0, labels.length - suffixParts)
    .flatMap((label) => label.split(/[-_]/))
    .filter(Boolean);
}

/** Is `host` that sign-in host, or a subdomain or parent of it? (`accounts.google.com` ~ `google.com`.) */
function sameFamily(host: string, known: string): boolean {
  return host === known || host.endsWith(`.${known}`) || known.endsWith(`.${host}`) || registrableDomain(host) === registrableDomain(known);
}

/**
 * The known sign-in host this page claims to be without being it, or `null`. Exported for tests.
 * A host on the brand's own name under another suffix (`google.de`, `paypal.co.uk`) is not a claim:
 * regional sites are real, and a squatter there is a lookalike/feed matter, not this rule's.
 */
export function signInElsewhere(host: string, title: string | undefined, signInHosts: Iterable<string>): string | null {
  const page = stripWww(host.toLowerCase().replace(/\.$/, ''));
  const known = [...new Set([...signInHosts].map((h) => stripWww(h.toLowerCase().replace(/^\./, ''))).filter(Boolean))];
  if (known.some((k) => sameFamily(page, k))) return null;
  const pageBrand = brandOf(page);
  const tokens = new Set(hostTokens(page));
  const titleWords = title && SIGN_IN_TITLE.test(title) ? new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) : null;

  // A host claim beats a title claim; within each, the shortest host names the brand
  // (`google.com` over `accounts.google.com`).
  const claims = (has: (brand: string) => boolean) =>
    known
      .filter((k) => {
        const brand = brandOf(k);
        return brand.length >= MIN_BRAND_LENGTH && !GENERIC_BRANDS.has(brand) && brand !== pageBrand && has(brand);
      })
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return claims((brand) => tokens.has(brand))[0] ?? claims((brand) => titleWords?.has(brand) ?? false)[0] ?? null;
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

  const claimed = signInElsewhere(host, input.title, input.signInHosts);
  if (claimed) reasons.push({ rule: 'sign-in-elsewhere', detail: claimed });

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
