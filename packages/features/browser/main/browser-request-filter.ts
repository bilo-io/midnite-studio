import { parseFilterList, type FilterList, type RequestResourceType } from './filter-list';

/**
 * Tracker and fingerprinting protection at the `webRequest` layer (Phase 117 Theme E).
 *
 * Everything here runs in main, on the `persist:browser` session, with no code in the page — a
 * preload is out of scope for a browser tab (phase guardrail 1). That is also why **canvas, audio
 * and font fingerprinting are not defended against**: it cannot be done without injecting script.
 * What ships instead is network-level: a tracker blocklist, no third-party cookies in either
 * direction, a trimmed `Referer`, and a reduced User-Agent. Stronger isolation (a partition per
 * tab group) is the follow-up in the phase doc's Decisions.
 *
 * Electron keeps ONE listener per `webRequest` event per session, so this module owns all three
 * (`onBeforeRequest`, `onBeforeSendHeaders`, `onHeadersReceived`); nothing else may register one
 * on this partition. Structural types only, like `browser-security.ts`.
 */

export type PrivacySettings = {
  blockTrackers: boolean;
  blockThirdPartyCookies: boolean;
  trimReferrer: boolean;
  reduceUserAgent: boolean;
};

/** On by default — the opposite of downloads. Switches exist for sites that break. */
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  blockTrackers: true,
  blockThirdPartyCookies: true,
  trimReferrer: true,
  reduceUserAgent: true,
};

// Second-level labels under which the registrable domain takes one more label. Not the full Public
// Suffix List (a 200 KB dependency for a heuristic); a miss means two unrelated `*.co.xx` sites
// look same-party, which under-blocks, never over-blocks.
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

/** The site a host belongs to: `a.b.example.co.uk` → `example.co.uk`. IPs and `localhost` stay whole. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return h;
  const parts = h.split('.');
  const take = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2 ? 3 : 2;
  return parts.slice(-take).join('.');
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether `requestUrl` is a different site from the page. Unknown page ⇒ first-party (never break). */
export function isThirdParty(pageUrl: string | null | undefined, requestUrl: string): boolean {
  if (!pageUrl) return false;
  const a = hostOf(pageUrl);
  const b = hostOf(requestUrl);
  if (!a || !b) return false;
  return registrableDomain(a) !== registrableDomain(b);
}

/**
 * `strict-origin-when-cross-origin`, applied to an outgoing `Referer`: same-origin keeps it,
 * cross-origin sends the origin only, an https → http downgrade sends nothing.
 */
export function rewriteReferrer(referer: string, requestUrl: string): string | null {
  let from: URL;
  let to: URL;
  try {
    from = new URL(referer);
    to = new URL(requestUrl);
  } catch {
    return null;
  }
  if (from.origin === to.origin) return referer;
  if (from.protocol === 'https:' && to.protocol !== 'https:') return null;
  return `${from.origin}/`;
}

/**
 * Chromium's own reduction, done by hand: major version only (`Chrome/130.0.0.0`), a fixed macOS
 * token, and the `Electron/x` and app-name tokens (which make the UA unique per install) dropped.
 */
export function reduceUserAgent(ua: string): string {
  const chrome = /Chrome\/(\d+)\./.exec(ua);
  if (!chrome) return ua;
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome[1]}.0.0.0 Safari/537.36`;
}

type Headers = Record<string, string | string[]>;

function withoutHeader(headers: Headers, name: string): Headers {
  const out: Headers = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== name) out[k] = v;
  return out;
}

type RequestDetails = {
  url: string;
  resourceType: string;
  webContents?: { getURL(): string } | null;
};

export type RequestFilterSession = {
  webRequest: {
    onBeforeRequest(listener: (details: RequestDetails, callback: (response: { cancel?: boolean }) => void) => void): void;
    onBeforeSendHeaders(
      listener: (
        details: RequestDetails & { requestHeaders: Headers },
        callback: (response: { requestHeaders?: Headers }) => void,
      ) => void,
    ): void;
    onHeadersReceived(
      listener: (
        details: RequestDetails & { responseHeaders?: Headers },
        callback: (response: { responseHeaders?: Headers }) => void,
      ) => void,
    ): void;
  };
  getUserAgent?(): string;
  setUserAgent?(ua: string): void;
};

export type RequestFilterOptions = {
  getSettings: () => PrivacySettings;
  /** Hosts (the page's registrable domain) the user exempted from protection. */
  isExcepted: (pageHost: string) => boolean;
  /** Told about each blocked request with the `webContents` that issued it. */
  onBlocked: (webContents: unknown, blockedHost: string, url: string) => void;
  /** Defaults to the bundled EasyPrivacy list, parsed lazily on first request. */
  loadList: () => FilterList;
};

let bundled: FilterList | null = null;
/** The bundled EasyPrivacy list, parsed once. Imported lazily so tests that never filter skip 1.4 MB. */
export function bundledFilterList(rules: string): FilterList {
  bundled ??= parseFilterList(rules);
  return bundled;
}

function mapType(t: string): RequestResourceType {
  return (t as RequestResourceType) ?? 'other';
}

export function installRequestFilter(session: RequestFilterSession, options: RequestFilterOptions): void {
  const protectedFor = (details: RequestDetails): { page: string; third: boolean } | null => {
    if (details.resourceType === 'mainFrame') return null;
    const page = details.webContents?.getURL() ?? null;
    if (!page) return null;
    const pageHost = hostOf(page);
    if (!pageHost || options.isExcepted(registrableDomain(pageHost))) return null;
    return isThirdParty(page, details.url) ? { page, third: true } : null;
  };

  session.webRequest.onBeforeRequest((details, callback) => {
    if (options.getSettings().blockTrackers) {
      const ctx = protectedFor(details);
      if (ctx) {
        const hit = options.loadList().match({ url: details.url, resourceType: mapType(details.resourceType), thirdParty: true });
        if (hit) {
          options.onBlocked(details.webContents, hit, details.url);
          callback({ cancel: true });
          return;
        }
      }
    }
    callback({});
  });

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const settings = options.getSettings();
    let headers = details.requestHeaders;
    let changed = false;
    if (settings.blockThirdPartyCookies && protectedFor(details)) {
      if (Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) {
        headers = withoutHeader(headers, 'cookie');
        changed = true;
      }
    }
    if (settings.trimReferrer) {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === 'referer');
      if (key) {
        const next = rewriteReferrer(String(headers[key]), details.url);
        if (next !== headers[key]) {
          headers = withoutHeader(headers, 'referer');
          if (next !== null) headers['Referer'] = next;
          changed = true;
        }
      }
    }
    callback(changed ? { requestHeaders: headers } : {});
  });

  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;
    if (options.getSettings().blockThirdPartyCookies && headers && protectedFor(details)) {
      if (Object.keys(headers).some((k) => k.toLowerCase() === 'set-cookie')) {
        callback({ responseHeaders: withoutHeader(headers, 'set-cookie') });
        return;
      }
    }
    callback({});
  });
}

/** Applies (or restores) the reduced UA. Keeps the original so turning the switch off is exact. */
export function createUserAgentController(session: Pick<RequestFilterSession, 'getUserAgent' | 'setUserAgent'>): (reduce: boolean) => void {
  let original: string | null = null;
  return (reduce) => {
    if (!session.getUserAgent || !session.setUserAgent) return;
    original ??= session.getUserAgent();
    session.setUserAgent(reduce ? reduceUserAgent(original) : original);
  };
}
