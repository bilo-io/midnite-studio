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

/**
 * Words a phishing kit pairs with a brand to make a host read as its sign-in page (`github-login`,
 * `paypalsecure`, `appleid-verify`). A brand in a site name *with* one of these is a claim; a brand
 * alone in a site name (`apple-orchard-club.com`, `jean-claude-art.com`) is only a mention.
 */
const PHISHING_KEYWORDS = new Set([
  'login', 'logon', 'signin', 'signon', 'verify', 'verification', 'secure', 'security', 'account', 'accounts',
  'auth', 'id', 'support', 'update', 'confirm', 'wallet', 'billing', 'password', 'recover', 'recovery',
  'unlock', 'helpdesk', 'service',
]);

/**
 * Shared-hosting suffixes, where the label *under* the platform is the site (`evil.netlify.app`), not
 * the platform. A two-label guess would make every page on them one site named after the platform —
 * and free hosting is where most phishing kits live.
 */
const SHARED_HOSTING_SUFFIXES = [
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'netlify.app', 'vercel.app', 'web.app',
  'firebaseapp.com', 'herokuapp.com', 'azurewebsites.net', 'blogspot.com', 'wixsite.com', 'weebly.com',
  'ngrok-free.app', 'ngrok.io', 'glitch.me', 'onrender.com', 'repl.co', '000webhostapp.com',
];

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** The site a host belongs to: its registrable domain, or `<label>.<platform>` on shared hosting. */
export function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  for (const suffix of SHARED_HOSTING_SUFFIXES) {
    if (h.endsWith(`.${suffix}`)) {
      const label = h.slice(0, -suffix.length - 1).split('.').pop();
      return label ? `${label}.${suffix}` : h;
    }
  }
  return registrableDomain(h);
}

/** `accounts.google.com` → `google`; `example.co.uk` → `example`; `evil.netlify.app` → `evil`. */
export function brandOf(host: string): string {
  return siteOf(stripWww(host.toLowerCase())).split('.')[0] ?? '';
}

const splitLabel = (label: string): string[] => label.split(/[-_]/).filter(Boolean);

/** The page's own site label's tokens (`github-login.app` → github, login) and its subdomains' tokens. */
function hostTokens(host: string): { site: string[]; subdomain: string[] } {
  const labels = host.split('.');
  const siteLabelIndex = labels.length - siteOf(host).split('.').length;
  return {
    site: splitLabel(labels[siteLabelIndex] ?? ''),
    subdomain: labels.slice(0, Math.max(0, siteLabelIndex)).flatMap(splitLabel),
  };
}


/**
 * How `token` carries `brand`: `'bare'` (exactly the brand, or the brand plus digits — `office365`),
 * `'paired'` (fused with a phishing keyword — `githublogin`, `appleid`, `securepaypal`), or `null`.
 */
function carries(token: string, brand: string): 'bare' | 'paired' | null {
  if (token === brand) return 'bare';
  if (token.startsWith(brand)) {
    const rest = token.slice(brand.length);
    if (/^\d+$/.test(rest)) return 'bare';
    if (PHISHING_KEYWORDS.has(rest)) return 'paired';
  }
  if (token.endsWith(brand) && PHISHING_KEYWORDS.has(token.slice(0, -brand.length))) return 'paired';
  return null;
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
  return host === known || host.endsWith(`.${known}`) || known.endsWith(`.${host}`) || siteOf(host) === siteOf(known);
}

export type BrandClaim = { rule: 'sign-in-elsewhere' | 'brand-mention'; detail: string };

/**
 * Which known sign-in host this page claims to be without being it, and how strongly. Exported for tests.
 *
 * - **`sign-in-elsewhere` (danger)** — the page's *own site name* carries the brand *and* a phishing
 *   keyword or a sign-in title naming it (`github-login.app`, `paypalsecure.com`,
 *   `office365-login.com`, `github-login.pages.dev`), or the host spells out the real site before its
 *   own (`paypal.com.secure-login.net`). Someone registered a name to carry it.
 * - **`brand-mention` (caution)** — the brand is in the site name with nothing pairing it
 *   (`apple-orchard-club.com`, `paypal-community.com`), only in a subdomain (`gitlab.mycorp.com`, a
 *   self-hosted forge), or only in the title ("Sign in to GitHub" on `mycorp.ghe.com`). Real sites
 *   look exactly like this, so on its own it never refuses anything.
 *
 * Generic brands (`live`, `office`, `outlook`, …) are words too: they count only when paired. A host on
 * the brand's own name under another suffix (`google.de`, `paypal.co.uk`) claims nothing — regional
 * sites are real, and a squatter there is a lookalike/feed matter, not this rule's.
 */
export function brandClaim(host: string, title: string | undefined, signInHosts: Iterable<string>): BrandClaim | null {
  const page = stripWww(host.toLowerCase().replace(/\.$/, ''));
  const known = [...new Set([...signInHosts].map((h) => stripWww(h.toLowerCase().replace(/^\./, ''))).filter(Boolean))];
  if (known.some((k) => sameFamily(page, k))) return null;
  const pageBrand = brandOf(page);
  const tokens = hostTokens(page);
  const claimedInTitle = titleBrands(title);
  const siteHasKeyword = tokens.site.some((token) => PHISHING_KEYWORDS.has(token));

  const strength = (k: string): BrandClaim['rule'] | null => {
    const brand = brandOf(k);
    if (brand.length < MIN_BRAND_LENGTH || brand === pageBrand || PHISHING_KEYWORDS.has(brand)) return null;
    const ks = siteOf(k);
    if (page.startsWith(`${ks}.`) || page.includes(`.${ks}.`)) return 'sign-in-elsewhere';
    const onSite = tokens.site.map((token) => carries(token, brand)).filter(Boolean);
    const paired = onSite.includes('paired') || (onSite.length > 0 && (siteHasKeyword || claimedInTitle.has(brand)));
    if (paired) return 'sign-in-elsewhere';
    if (GENERIC_BRANDS.has(brand)) return null;
    if (onSite.length > 0) return 'brand-mention';
    if (tokens.subdomain.some((token) => carries(token, brand)) || claimedInTitle.has(brand)) return 'brand-mention';
    return null;
  };

  // The strongest claim wins; within one, the shortest host names the brand (`google.com` over
  // `accounts.google.com`).
  const ranked = known
    .map((k) => ({ k, rule: strength(k) }))
    .filter((c): c is { k: string; rule: BrandClaim['rule'] } => c.rule !== null)
    .sort((a, b) => (a.rule === b.rule ? a.k.length - b.k.length || a.k.localeCompare(b.k) : a.rule === 'sign-in-elsewhere' ? -1 : 1));
  const best = ranked[0];
  return best ? { rule: best.rule, detail: best.k } : null;
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
  const pageSite = siteOf(host);
  for (const action of input.read.formActionOrigins) {
    const target = originOf(action);
    if (!target) continue;
    if (target.protocol === 'http:' && !isLoopbackHost(target.hostname)) postsInsecurely = true;
    if (siteOf(target.hostname) !== pageSite && !reasons.some((r) => r.rule === 'cross-origin-action')) {
      reasons.push({ rule: 'cross-origin-action', detail: target.origin });
    }
  }

  // A password posted to plain http: is exposed in transit whatever page asked for it.
  if (postsInsecurely && !httpPage) reasons.unshift({ rule: 'http-password' });

  if (reasons.length === 0) return { risk: null, insecureForm: postsInsecurely };
  const level = reasons.some((r) => CREDENTIAL_RULE_LEVEL[r.rule] === 'danger') ? 'danger' : 'caution';
  return { risk: { level, reasons }, insecureForm: httpPage || postsInsecurely };
}
