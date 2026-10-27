import { z } from 'zod';

/**
 * Phase 115 Theme A — every host the app talks to, in one list.
 *
 * `guardedFetch` (runtime) looks a request's host up here and refuses it when the entry's switch is off;
 * `egress-registry.test.ts` fails on any main-side `fetch` that bypasses it; `buildCsp` takes its renderer
 * hosts from the `renderer: true` entries; Settings ▸ Privacy and `docs/PRIVACY.md` are generated from it.
 * A new outbound host starts as an entry here.
 *
 * zod only, per `shared`'s boundary.
 */

/** Switches that gate an `automatic` entry. A switch id is the stored key's name in Settings ▸ Privacy. */
export const PRIVACY_SWITCHES = {
  weather: 'Title-bar weather (Open-Meteo)',
  'locate-by-ip': 'Locate me by IP (ipwho.is)',
  markets: 'Market prices, FX and finance news',
  'guard-feeds': 'Guard vulnerability feeds (OSV, CISA KEV)',
  'launcher-updates': 'Launcher: check for Studio updates at start',
  'launcher-catalog': 'Launcher: refresh the app catalog at start',
  'reputation-urlhaus': 'Browser reputation feed: URLhaus',
  'reputation-openphish': 'Browser reputation feed: OpenPhish',
} as const;

export type PrivacySwitchId = keyof typeof PRIVACY_SWITCHES;
export const PRIVACY_SWITCH_IDS = Object.keys(PRIVACY_SWITCHES) as PrivacySwitchId[];

/**
 * Switches that already have their own persisted flag and bespoke row in Settings ▸ Privacy (Phase 76 D's
 * `locateByIpEnabled`, Phase 117 C's reputation feeds). The generated list skips them; the seam reads them
 * through the same stored-switch map, mirrored into main.
 */
export const BESPOKE_PRIVACY_SWITCHES: readonly PrivacySwitchId[] = ['locate-by-ip', 'reputation-urlhaus', 'reputation-openphish'];

export const EgressHostSchema = z
  .object({
    /** An exact host, a `*.suffix` wildcard, or `*` for user-supplied URLs. */
    host: z.string().min(1),
    /** A feature id, `launcher`, or `app` for the shell itself. */
    owner: z.string().min(1),
    /** One plain sentence: what leaves the Mac. */
    sends: z.string().min(1),
    /** `automatic` fires without a click, `feed` is a scheduled list download, `user` follows a user action. */
    trigger: z.enum(['user', 'automatic', 'feed']),
    /** Required when `trigger` is `automatic` or `feed`. */
    switch: z.enum(Object.keys(PRIVACY_SWITCHES) as [PrivacySwitchId, ...PrivacySwitchId[]]).optional(),
    /** The renderer's CSP `connect-src` lists this host. */
    renderer: z.boolean().optional(),
    description: z.string().optional(),
  })
  .refine((entry) => entry.trigger === 'user' || entry.switch !== undefined, {
    message: 'an automatic or feed entry needs a switch',
  });

export type EgressHost = z.infer<typeof EgressHostSchema>;

const entry = (value: EgressHost): EgressHost => value;

/** Every entry. The source of truth: two owners register `*`, so it is a list, not a map keyed by host. */
export const EGRESS_ENTRIES: readonly EgressHost[] = [
  // ── automatic ──
  entry({ host: 'api.open-meteo.com', owner: 'titlebar-status', sends: 'coordinates of the chosen city, for a forecast', trigger: 'automatic', switch: 'weather', renderer: true }),
  entry({ host: 'geocoding-api.open-meteo.com', owner: 'titlebar-status', sends: 'the city name typed into weather and map search', trigger: 'automatic', switch: 'weather', renderer: true }),
  entry({ host: 'ipwho.is', owner: 'titlebar-status', sends: 'the Mac’s public IP address (the server sees it), to guess a city', trigger: 'automatic', switch: 'locate-by-ip', renderer: true }),
  entry({ host: 'api.coingecko.com', owner: 'finance', sends: 'GET only: crypto asset ids, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'data-api.binance.vision', owner: 'finance', sends: 'GET only: crypto symbols, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'query1.finance.yahoo.com', owner: 'finance', sends: 'GET only: ticker symbols, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'api.nasdaq.com', owner: 'finance', sends: 'GET only: ticker symbols, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'open.er-api.com', owner: 'finance', sends: 'GET only: a base currency, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'api.frankfurter.dev', owner: 'finance', sends: 'GET only: a base currency, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'ts-api.cnbc.com', owner: 'finance', sends: 'GET only: ticker symbols, no identifiers', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'news.google.com', owner: 'finance', sends: 'GET only: a news search query for a held asset', trigger: 'automatic', switch: 'markets' }),
  entry({ host: 'api.osv.dev', owner: 'guard', sends: 'package names and versions found in the user’s repositories, to look up advisories', trigger: 'automatic', switch: 'guard-feeds' }),
  entry({ host: 'www.cisa.gov', owner: 'guard', sends: 'GET only: the public Known Exploited Vulnerabilities list', trigger: 'automatic', switch: 'guard-feeds' }),
  entry({ host: 'cdn.jsdelivr.net', owner: 'media-video', sends: 'GET only: a pinned animation library, loaded by a video render the user started, no identifiers', trigger: 'user' }),
  entry({ host: 'midnite-apps.vercel.app', owner: 'launcher', sends: 'GET only: the app catalog, no identifiers', trigger: 'automatic', switch: 'launcher-catalog' }),
  entry({ host: 'raw.githubusercontent.com', owner: 'launcher', sends: 'GET only: the Studio update feed, no identifiers', trigger: 'automatic', switch: 'launcher-updates' }),
  // ── scheduled feeds (Phase 117 Theme C: pulled whole, matched on this Mac, off by default) ──
  entry({ host: 'urlhaus.abuse.ch', owner: 'browser', sends: 'nothing about the user — a plain GET of the public online-URL list (CC0)', trigger: 'feed', switch: 'reputation-urlhaus', description: 'URLhaus malware URL feed for the Browser app' }),
  entry({ host: 'openphish.com', owner: 'browser', sends: 'nothing about the user — a plain GET of the public community feed', trigger: 'feed', switch: 'reputation-openphish', description: 'OpenPhish community phishing feed for the Browser app' }),
  // ── user-initiated ──
  entry({ host: 'api.pwnedpasswords.com', owner: 'vault', sends: 'the first five hex characters of a SHA-1 of the password; never the password, never the hash', trigger: 'user', description: 'Have I Been Pwned Pwned Passwords k-anonymity breach check' }),
  entry({ host: 'overpass-api.de', owner: 'media-map', sends: 'a bounding box, for roads and buildings', trigger: 'user' }),
  entry({ host: 'ollama.com', owner: 'models', sends: 'the model search text', trigger: 'user' }),
  entry({ host: 'api.themoviedb.org', owner: 'media-library', sends: 'a title search text and the user’s TMDB key', trigger: 'user' }),
  entry({ host: 'image.tmdb.org', owner: 'media-library', sends: 'GET only: poster paths', trigger: 'user' }),
  entry({ host: 'github.com', owner: 'app', sends: 'GET only: a model download the user asked for (speech model)', trigger: 'user' }),
  entry({ host: 'api.openai.com', owner: 'media-images', sends: 'the user’s image prompt and API key', trigger: 'user' }),
  entry({ host: 'generativelanguage.googleapis.com', owner: 'media-images', sends: 'the user’s image prompt and API key', trigger: 'user' }),
  entry({ host: 'api.maptiler.com', owner: 'media-map', sends: 'tile coordinates and the user’s MapTiler key', trigger: 'user' }),
  entry({ host: 'tiles.openfreemap.org', owner: 'media-map', sends: 'GET only: map tile coordinates', trigger: 'user' }),
  entry({ host: 'huggingface.co', owner: 'models', sends: 'GET only: a model download the user asked for', trigger: 'user' }),
  entry({ host: '*', owner: 'finance', sends: 'a plain GET of an RSS feed URL the user added to the news list', trigger: 'user' }),
  entry({ host: '*', owner: 'api-client', sends: 'whatever request the user composes, to the URL they typed', trigger: 'user' }),
  entry({ host: '*', owner: 'workflows', sends: 'whatever the workflow’s HTTP node is set to send, to its URL', trigger: 'user' }),
];

/** The concrete hosts, keyed by host (the Vanguard sensor resolves these names; a `*` has nothing to resolve). */
export const EGRESS_HOSTS: Record<string, EgressHost> = Object.fromEntries(
  EGRESS_ENTRIES.filter((e) => !e.host.includes('*')).map((e) => [e.host, e]),
);

function hostMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return false;
}

/** The entry for a URL's host (exact beats wildcard), or `undefined` when unregistered. `*` never matches here. */
export function findEgressEntry(url: string | URL): EgressHost | undefined {
  let host: string;
  try {
    host = (typeof url === 'string' ? new URL(url) : url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return EGRESS_ENTRIES.find((e) => e.host === host) ?? EGRESS_ENTRIES.find((e) => e.host !== '*' && hostMatches(e.host, host));
}

/** The renderer's `connect-src` hosts, as origins. */
export function rendererConnectOrigins(): string[] {
  return EGRESS_ENTRIES.filter((e) => e.renderer === true && !e.host.includes('*')).map((e) => `https://${e.host}`);
}

/** Every switch an automatic or feed entry names, with the entries it gates, in registry order. */
export function egressSwitchGroups(): { id: PrivacySwitchId; label: string; owner: string; entries: EgressHost[] }[] {
  const groups = new Map<PrivacySwitchId, { id: PrivacySwitchId; label: string; owner: string; entries: EgressHost[] }>();
  for (const e of EGRESS_ENTRIES) {
    if (!e.switch) continue;
    const group = groups.get(e.switch) ?? { id: e.switch, label: PRIVACY_SWITCHES[e.switch], owner: e.owner, entries: [] };
    group.entries.push(e);
    groups.set(e.switch, group);
  }
  return [...groups.values()];
}

/**
 * The stored position of every switch, plus the master. Absent ids use their default: on, except the
 * switches that have always shipped off (`locate-by-ip`, the reputation feeds).
 */
export const EgressSettingsSchema = z.object({
  /** "Turn off all automatic network" — overrides every switch without changing its stored value. */
  allAutomaticOff: z.boolean().optional(),
  switches: z.record(z.string(), z.boolean()).optional(),
});
export type EgressSettings = z.infer<typeof EgressSettingsSchema>;

export const PRIVACY_SWITCH_DEFAULTS: Record<PrivacySwitchId, boolean> = {
  weather: true,
  'locate-by-ip': false,
  markets: true,
  'guard-feeds': true,
  'launcher-updates': true,
  'launcher-catalog': true,
  'reputation-urlhaus': false,
  'reputation-openphish': false,
};

export function privacySwitchOn(settings: EgressSettings | undefined, id: PrivacySwitchId): boolean {
  if (settings?.allAutomaticOff === true) return false;
  return settings?.switches?.[id] ?? PRIVACY_SWITCH_DEFAULTS[id];
}
