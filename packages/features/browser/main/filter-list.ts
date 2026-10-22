/**
 * An Adblock Plus filter-list matcher for the browser's `webRequest` blocklist (Phase 117 Theme E).
 *
 * Scope, deliberately narrow: **host-anchored network rules** — `||host^`, `||host/path*`, with the
 * handful of options that mean the same thing in Electron's `webRequest` (`third-party` and the
 * resource-type restrictions) — plus `@@` exceptions. That is the form the overwhelming majority
 * of EasyPrivacy takes (~47k of ~57k lines). Everything else is *counted and dropped*, never
 * half-supported: cosmetic (`##`) rules need a content script and a preload is out of scope for a
 * browser tab (Phase 117 guardrail 1); unanchored substring rules and rules with options we do not
 * model (`domain=`, `redirect=`, `csp=`, negated types …) would each be a guess at a match that
 * the list's authors meant precisely, and a wrong guess breaks a page.
 *
 * The index is a map keyed by registrable-ish host, queried by walking the request host's parent
 * domains (`a.b.tracker.com` → `b.tracker.com` → `tracker.com`) — the same lookups a label trie
 * makes, without the node overhead for ~45k keys. Built once, on first use.
 *
 * Pure: no Electron, no I/O.
 */

/** Electron's `webRequest` `resourceType` values we map the list's type options onto. */
export type RequestResourceType =
  | 'mainFrame'
  | 'subFrame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xhr'
  | 'ping'
  | 'cspReport'
  | 'media'
  | 'webSocket'
  | 'other';

const TYPE_OPTIONS: Record<string, RequestResourceType[]> = {
  script: ['script'],
  image: ['image'],
  stylesheet: ['stylesheet'],
  xmlhttprequest: ['xhr'],
  xhr: ['xhr'],
  ping: ['ping', 'cspReport'],
  subdocument: ['subFrame'],
  media: ['media'],
  font: ['font'],
  object: ['object'],
  websocket: ['webSocket'],
  other: ['other'],
};

type Rule = {
  /** Path pattern after the host (`''` = whole host), lowercase, `*`/`^` wildcards. */
  path: string;
  thirdPartyOnly: boolean;
  types: RequestResourceType[] | null;
  regex?: RegExp | null;
};

export type FilterListStats = {
  /** Rules kept as blocking rules. */
  block: number;
  /** Rules kept as `@@` exceptions. */
  exceptions: number;
  /** Rules dropped: cosmetic, unanchored, or carrying an option we do not model. */
  skipped: number;
};

export type FilterList = {
  stats: FilterListStats;
  /** The matching rule's host key when the request should be blocked, else `null`. */
  match(input: { url: string; resourceType: RequestResourceType; thirdParty: boolean }): string | null;
};

function parseRule(raw: string): { exception: boolean; host: string; rule: Rule } | null {
  let line = raw.trim();
  if (line === '' || line.startsWith('!') || line.startsWith('[')) return null;
  if (line.includes('##') || line.includes('#@#') || line.includes('#?#') || line.includes('#$#')) return null;
  let exception = false;
  if (line.startsWith('@@')) {
    exception = true;
    line = line.slice(2);
  }
  if (!line.startsWith('||')) return null;

  let options = '';
  const dollar = line.lastIndexOf('$');
  if (dollar !== -1) {
    options = line.slice(dollar + 1);
    line = line.slice(0, dollar);
  }

  let thirdPartyOnly = false;
  let types: RequestResourceType[] | null = null;
  if (options !== '') {
    for (const opt of options.split(',')) {
      const name = opt.trim().toLowerCase();
      if (name === 'third-party' || name === '3p') {
        thirdPartyOnly = true;
      } else if (name === 'important' || name === 'all') {
        // `important` only outranks exceptions; `all` is every type. Both are no-ops here.
      } else if (TYPE_OPTIONS[name]) {
        types = [...(types ?? []), ...TYPE_OPTIONS[name]!];
      } else {
        return null; // domain=, redirect=, csp=, ~negations … — not modelled, so not guessed.
      }
    }
  }

  const body = line.slice(2).toLowerCase();
  const m = /^([a-z0-9._-]+)(.*)$/.exec(body);
  if (!m) return null;
  const host = m[1]!.replace(/^\.+|\.+$/g, '');
  if (host === '' || !host.includes('.')) return null;
  let path = m[2]!;
  // A bare `^` (separator) straight after the host means "the whole host".
  if (path === '^' || path === '/' || path === '/^') path = '';
  return { exception, host, rule: { path, thirdPartyOnly, types } };
}

function pathRegex(path: string): RegExp {
  // `*` = anything, `^` = a separator (end of string or a non-word char other than `-._%`).
  const src = path
    .replace(/[.+?${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\^/g, '(?:[^\\w\\-.%]|$)');
  return new RegExp(`^${src}`);
}

function ruleMatches(rule: Rule, input: { pathAndQuery: string; resourceType: RequestResourceType; thirdParty: boolean }): boolean {
  if (rule.thirdPartyOnly && !input.thirdParty) return false;
  if (rule.types && !rule.types.includes(input.resourceType)) return false;
  if (rule.path === '') return true;
  if (rule.regex === undefined) rule.regex = pathRegex(rule.path);
  return rule.regex!.test(input.pathAndQuery);
}

/** Parse ABP filter-list text into a matcher. Linear in the list, once. */
export function parseFilterList(text: string): FilterList {
  const block = new Map<string, Rule[]>();
  const allow = new Map<string, Rule[]>();
  const stats: FilterListStats = { block: 0, exceptions: 0, skipped: 0 };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('!') || line.startsWith('[')) continue;
    const parsed = parseRule(line);
    if (!parsed) {
      stats.skipped++;
      continue;
    }
    const target = parsed.exception ? allow : block;
    const bucket = target.get(parsed.host);
    if (bucket) bucket.push(parsed.rule);
    else target.set(parsed.host, [parsed.rule]);
    if (parsed.exception) stats.exceptions++;
    else stats.block++;
  }

  const lookup = (
    index: Map<string, Rule[]>,
    host: string,
    input: { pathAndQuery: string; resourceType: RequestResourceType; thirdParty: boolean },
  ): string | null => {
    let h = host;
    for (;;) {
      const rules = index.get(h);
      if (rules?.some((r) => ruleMatches(r, input))) return h;
      const dot = h.indexOf('.');
      if (dot === -1) return null;
      h = h.slice(dot + 1);
      if (!h.includes('.')) return null;
    }
  };

  return {
    stats,
    match({ url, resourceType, thirdParty }) {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return null;
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') {
        return null;
      }
      const host = u.hostname.toLowerCase();
      const input = { pathAndQuery: `${u.pathname}${u.search}`.toLowerCase(), resourceType, thirdParty };
      const hit = lookup(block, host, input);
      if (hit === null) return null;
      return lookup(allow, host, input) === null ? hit : null;
    },
  };
}
