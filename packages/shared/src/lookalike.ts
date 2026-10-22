/**
 * Lookalike-domain rules (Phase 117 Theme C) — pure, no node builtins, so the browser feature's
 * main half, its renderer and Theme F's phishing rules all run the exact same code.
 *
 * Three questions, each a function:
 *
 * - **Is a label mixed-script?** {@link isUniformScript} — a label whose letters come from more than
 *   one Unicode script (Latin `pple` + Cyrillic `а` = `xn--pple-43d`) is the classic IDN homograph.
 *   Common/Inherited characters (digits, hyphens, combining marks) never count as a script.
 * - **Does a host read as one the user already knows?** {@link confusableSkeleton} folds a host to a
 *   Latin "skeleton" (a reduced TR39 confusables table: Cyrillic/Greek lookalikes, diacritics,
 *   `0`→`o`, `1`/`i`→`l`, `rn`→`m`, `vv`→`w`); two different hosts with one skeleton are confusable.
 * - **How should the address bar show it?** {@link displayHost} — Unicode only when every label is
 *   uniform-script *and* the host is not a lookalike; punycode (`xn--…`) otherwise, the same rule
 *   Theme B's permission bar applies through `idn-hygiene.ts`.
 *
 * {@link findLookalike} combines them into the `SiteVerdict.lookalike` value. Theme F reuses it
 * as-is for its "login form on a lookalike" rule, passing the Vault's sign-in domains as
 * `knownHosts`.
 */

// --- punycode (RFC 3492), decode only -------------------------------------------------------

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitOf(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return cp - 22; // '0'..'9' → 26..35
  if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41; // 'A'..'Z'
  if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61; // 'a'..'z'
  return BASE;
}

/** Decodes one punycode label body (without the `xn--` prefix). `null` on malformed input. */
export function punycodeDecode(input: string): string | null {
  const output: number[] = [];
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  const basic = Math.max(0, input.lastIndexOf('-'));
  for (let j = 0; j < basic; j++) {
    const cp = input.charCodeAt(j);
    if (cp >= 0x80) return null;
    output.push(cp);
  }
  for (let index = basic > 0 ? basic + 1 : 0; index < input.length; ) {
    const oldI = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitOf(input.charCodeAt(index++));
      if (digit >= BASE) return null;
      i += digit * w;
      if (i > 0x7fffffff) return null;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldI, length, oldI === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** `xn--pple-43d.com` → `аpple.com`. Malformed `xn--` labels are left as they are. */
export function hostToUnicode(host: string): string {
  return host
    .toLowerCase()
    .split('.')
    .map((label) => (label.startsWith('xn--') ? (punycodeDecode(label.slice(4)) ?? label) : label))
    .join('.');
}

// --- scripts ------------------------------------------------------------------------------------

const KNOWN_SCRIPTS = [
  'Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Han', 'Hiragana', 'Katakana', 'Hangul',
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Tibetan', 'Myanmar', 'Georgian', 'Ethiopic', 'Cherokee',
  'Ogham', 'Runic', 'Khmer', 'Mongolian', 'Armenian',
] as const;

const SCRIPT_REGEXES = KNOWN_SCRIPTS.map((name) => ({ name, regex: new RegExp(`^\\p{sc=${name}}$`, 'u') }));
const COMMON_OR_INHERITED = /^[\p{sc=Common}\p{sc=Inherited}]$/u;

/**
 * Japanese mixes Han, Hiragana and Katakana by design — one writing system, three scripts —
 * so they count as one here, as Chromium's IDN policy does.
 */
const SCRIPT_FAMILY: Partial<Record<string, string>> = { Han: 'Jpan', Hiragana: 'Jpan', Katakana: 'Jpan' };

function scriptOf(ch: string): string | null {
  for (const { name, regex } of SCRIPT_REGEXES) if (regex.test(ch)) return SCRIPT_FAMILY[name] ?? name;
  return null;
}

/** The scripts a label's letters use, ignoring Common/Inherited characters. */
export function scriptsOf(label: string): Set<string> {
  const scripts = new Set<string>();
  for (const ch of label) {
    if (COMMON_OR_INHERITED.test(ch)) continue;
    const script = scriptOf(ch);
    if (script) scripts.add(script);
  }
  return scripts;
}

/** True when every letter in `label` belongs to one script (an empty label is uniform). */
export function isUniformScript(label: string): boolean {
  return scriptsOf(label).size <= 1;
}

// --- confusables ----------------------------------------------------------------------------------

/**
 * A reduced TR39 confusables table: the characters actually seen in homograph phishing, mapped to
 * the Latin letter they impersonate. Deliberately small and readable over complete — the skeleton
 * comparison only ever runs against hosts the user already knows, so a missing pair costs a missed
 * warning, never a false one.
 */
const CONFUSABLE_TO_LATIN: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ё: 'e', һ: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', ӏ: 'l',
  м: 'm', н: 'h', о: 'o', р: 'p', ԛ: 'q', ѕ: 's', т: 't', у: 'y', ү: 'y', х: 'x', ԝ: 'w', ь: 'b',
  // Greek
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  ω: 'w',
  // Latin extensions and IPA that NFKD does not fold
  ı: 'i', ɑ: 'a', ɡ: 'g', ł: 'l', ŀ: 'l', ø: 'o', đ: 'd', ħ: 'h', ʏ: 'y', ꞵ: 'b',
};

/**
 * Folds a host to the Latin string it reads as. `аpple.com`, `appIe.com` and `app1e.com` all fold
 * to the same skeleton as `apple.com` — equality of skeletons is the only property callers rely
 * on, not the skeleton's spelling (`i`, `1` and `l` all become `l`).
 */
export function confusableSkeleton(host: string): string {
  let s = hostToUnicode(host)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  s = Array.from(s, (ch) => CONFUSABLE_TO_LATIN[ch] ?? ch).join('');
  return s
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
    .replace(/0/g, 'o')
    .replace(/[1i|]/g, 'l');
}

/** `www.` never distinguishes one site from another for this comparison. */
function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/**
 * Hosts phishing most often impersonates — the confusable check's floor before the user has any
 * history. The Vault's sign-in domains and the hosts visited this session are added at the call site.
 */
export const COMMONLY_IMPERSONATED_HOSTS: readonly string[] = [
  'google.com', 'accounts.google.com', 'gmail.com', 'youtube.com', 'apple.com', 'icloud.com',
  'microsoft.com', 'live.com', 'outlook.com', 'office.com', 'github.com', 'gitlab.com',
  'bitbucket.org', 'npmjs.com', 'paypal.com', 'amazon.com', 'facebook.com', 'instagram.com',
  'x.com', 'twitter.com', 'linkedin.com', 'netflix.com', 'dropbox.com', 'slack.com', 'notion.so',
  'figma.com', 'anthropic.com', 'claude.ai', 'openai.com', 'chatgpt.com', 'binance.com',
  'coinbase.com', 'stripe.com',
];

export type Lookalike = {
  kind: 'idn-mixed-script' | 'confusable';
  /** How the address bar shows the host — punycode whenever this is non-null. */
  displayHost: string;
  /** The known host it impersonates, when one matched. */
  against?: string;
};

/**
 * The `SiteVerdict.lookalike` rule. `null` for a host the user knows (exact match) or one that
 * neither mixes scripts nor folds to a known host's skeleton.
 *
 * - **`idn-mixed-script`** — any label mixes scripts (`against` set too if it also folds onto a known host).
 * - **`confusable`** — a uniform-script host (all-Cyrillic `аррӏе.com`, or ASCII `paypa1.com`) whose
 *   skeleton equals a known host's.
 */
export function findLookalike(host: string, knownHosts: Iterable<string>): Lookalike | null {
  const ascii = stripWww(host.toLowerCase().replace(/\.$/, ''));
  if (ascii.length === 0) return null;
  const known = new Set<string>();
  for (const h of knownHosts) known.add(stripWww(h.toLowerCase()));
  if (known.has(ascii)) return null;

  const skeleton = confusableSkeleton(ascii);
  let against: string | undefined;
  for (const candidate of known) {
    if (candidate !== ascii && confusableSkeleton(candidate) === skeleton) {
      against = candidate;
      break;
    }
  }

  const mixed = hostToUnicode(ascii)
    .split('.')
    .some((label) => !isUniformScript(label));
  if (mixed) return { kind: 'idn-mixed-script', displayHost: host.toLowerCase(), ...(against ? { against } : {}) };
  if (against) return { kind: 'confusable', displayHost: host.toLowerCase(), against };
  return null;
}

/**
 * The address bar's rule for an IDN host: Unicode only when every label is uniform-script and the
 * host is not a lookalike of a known one, punycode otherwise. ASCII hosts pass through unchanged.
 */
export function displayHost(host: string, knownHosts: Iterable<string> = COMMONLY_IMPERSONATED_HOSTS): string {
  const lower = host.toLowerCase();
  if (!lower.split('.').some((label) => label.startsWith('xn--'))) return lower;
  if (findLookalike(lower, knownHosts)) return lower;
  const unicode = hostToUnicode(lower);
  return unicode.split('.').every(isUniformScript) ? unicode : lower;
}
