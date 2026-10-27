import type { SiteFeedId, SiteKnownBad } from '@midnite/studio-shared';

/**
 * The open reputation feeds and how a URL is matched against them (Phase 117 Theme C, Decision 2).
 *
 * Both feeds are pulled whole and matched on this Mac — the user's browsing never leaves it, which
 * is the whole reason Google Safe Browsing's lookup API is not used. Pure: parsing and matching
 * take strings; `feed-service.ts` owns the network, the disk and the schedule.
 *
 * Matching is deliberately two-tier, because URLhaus lists *URLs* — very often a single payload
 * path on an otherwise legitimate, compromised host (a GitHub release asset, a WordPress upload):
 *
 * - an entry whose path is `/` (and has no query) names the **whole host** — matched by exact host;
 * - anything longer is a **URL prefix** — matched only when the visited URL starts with it.
 *
 * So `https://github.com/evil/x/releases/download/a.exe` flags that download, never github.com.
 */

export type FeedDefinition = {
  id: SiteFeedId;
  /** Shown in the badge and in Settings ▸ Privacy. */
  label: string;
  url: string;
  category: 'malware' | 'phishing';
  licence: string;
};

export const REPUTATION_FEEDS: Record<SiteFeedId, FeedDefinition> = {
  urlhaus: {
    id: 'urlhaus',
    label: 'URLhaus (abuse.ch)',
    url: 'https://urlhaus.abuse.ch/downloads/text_online/',
    category: 'malware',
    licence: 'CC0',
  },
  openphish: {
    id: 'openphish',
    label: 'OpenPhish community feed',
    url: 'https://openphish.com/feed.txt',
    category: 'phishing',
    licence: 'OpenPhish community feed terms (free, attribution)',
  },
};

export type FeedIndex = {
  feed: SiteFeedId;
  /** Whole-host entries. */
  hosts: Set<string>;
  /** URL-prefix entries, bucketed by host so a lookup scans only that host's few. */
  prefixes: Map<string, string[]>;
  size: number;
};

/** `scheme://host[:port]/path?query`, host lower-cased, fragment dropped. `null` for a non-web URL. */
function normalise(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

/** One URL per line; `#` comments and blank lines skipped; unparseable lines ignored. */
export function parseFeed(feed: SiteFeedId, text: string): FeedIndex {
  const index: FeedIndex = { feed, hosts: new Set(), prefixes: new Map(), size: 0 };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const url = normalise(trimmed);
    if (!url) continue;
    const host = url.hostname;
    if ((url.pathname === '/' || url.pathname === '') && url.search === '') {
      index.hosts.add(host);
    } else {
      const bucket = index.prefixes.get(host) ?? [];
      bucket.push(`${url.host}${url.pathname}${url.search}`);
      index.prefixes.set(host, bucket);
    }
    index.size++;
  }
  return index;
}

/**
 * The first feed listing `url`, as a `SiteVerdict.knownBad`. Scheme is ignored (a feed entry for
 * `http://` still catches the `https://` twin) and `www.` is not special — feeds list exact hosts.
 */
export function matchFeeds(indexes: Iterable<FeedIndex>, rawUrl: string): SiteKnownBad | null {
  const url = normalise(rawUrl);
  if (!url) return null;
  const host = url.hostname;
  const target = `${url.host}${url.pathname}${url.search}`;
  for (const index of indexes) {
    const category = REPUTATION_FEEDS[index.feed].category;
    if (index.hosts.has(host)) return { feed: index.feed, category, match: host };
    for (const prefix of index.prefixes.get(host) ?? []) {
      if (target.startsWith(prefix)) return { feed: index.feed, category, match: prefix };
    }
  }
  return null;
}
