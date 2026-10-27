import { WEB_APP_DEFINITIONS, type SiteFeedId, type SiteKnownBad, type SiteVerdict } from '@midnite/studio-shared';

import { browserMainDeps, defaultLogger } from './browser-main-deps';
import { createReputationFeedService, type FeedFetch, type ReputationFeedService } from './feeds/feed-service';
import { createSiteVerdictTracker, type SiteVerdictTracker } from './site-verdict-state';

/**
 * The browser partition's site-safety state (Phase 117 Theme C), one per process — the glue
 * between the pure rules (`site-verdict-state.ts`, `feeds/`, `lookalike.ts`) and
 * `browser-service.ts`, which owns the tabs.
 *
 * - **Settings** come from the renderer over `browserSetSiteSafety`: `allowProceed`
 *   (Settings ▸ Browser) and the feed switches (Settings ▸ Privacy), all default off. Main
 *   starts with every one off, so a composer that never pushes them ships the safe defaults.
 * - **TLS** results arrive from the session's certificate verifier, per host.
 * - **Bypasses** are in memory only — a "proceed for this session" ends with the app, and turning
 *   the Settings switch off revokes every one. The two kinds never cover for each other: a
 *   certificate bypass is per host, and a known-bad bypass is per feed entry (`SiteKnownBad.match`),
 *   so proceeding past one listed URL on a shared host neither accepts a bad certificate there nor
 *   lifts the host's other listed URLs.
 */

export type SiteSafetySettings = { allowProceed: boolean; feeds: Record<SiteFeedId, boolean> };

const DEFAULT_SETTINGS: SiteSafetySettings = { allowProceed: false, feeds: { urlhaus: false, openphish: false } };

let settings: SiteSafetySettings = DEFAULT_SETTINGS;
let feeds: ReputationFeedService | null = null;
let tracker: SiteVerdictTracker | null = null;
const tlsErrors = new Map<string, string>();
const certificateBypassHosts = new Set<string>();
const knownBadBypassMatches = new Set<string>();
let emitVerdict: (tabId: string, verdict: SiteVerdict) => void = () => {};

/** A service that is never enabled: no `userData` directory means nowhere to keep a list. */
const NO_FEEDS: ReputationFeedService = {
  setEnabled: () => {},
  match: () => null,
  reputation: () => 'unavailable',
  refresh: async () => false,
  dispose: () => {},
};

export function reputationFeeds(): ReputationFeedService {
  if (!feeds) {
    const directory = browserMainDeps().userDataPath;
    feeds = directory
      ? createReputationFeedService({
          directory,
          fetch: ((url, init) => globalThis.fetch(url, init)) as FeedFetch,
          log: (message) => defaultLogger(message),
        })
      : NO_FEEDS;
  }
  return feeds;
}

/**
 * The per-tab verdict state. **Theme D** reads `verdictForWebContents`; **Theme E** calls
 * `noteTrackerBlocked`; **Theme F** calls `patch` and `addKnownHosts` (the Vault's sign-in domains).
 */
export function siteVerdicts(): SiteVerdictTracker {
  if (!tracker) {
    tracker = createSiteVerdictTracker({
      feeds: reputationFeeds(),
      tlsErrorFor: (host) => tlsErrors.get(host),
      isBypassed: (url) => isCertificateBypassed(url) || isKnownBadBypassed(url),
      emit: (tabId, verdict) => emitVerdict(tabId, verdict),
    });
    // The web apps the Vault knows sign-ins for — a page impersonating one of them is a lookalike.
    tracker.addKnownHosts(Object.values(WEB_APP_DEFINITIONS).map((app) => new URL(app.launchUrl).hostname));
  }
  return tracker;
}

/** `browser-service.ts` routes verdicts to the tab's window. */
export function installVerdictEmitter(emit: (tabId: string, verdict: SiteVerdict) => void): void {
  emitVerdict = emit;
}

export function setBrowserSiteSafety(next: SiteSafetySettings): void {
  settings = { allowProceed: next.allowProceed, feeds: { ...next.feeds } };
  if (!settings.allowProceed) {
    // "Off" means a warning has no way past it — including the ones already passed this session.
    certificateBypassHosts.clear();
    knownBadBypassMatches.clear();
  }
  reputationFeeds().setEnabled(settings.feeds);
}

export function siteSafetySettings(): SiteSafetySettings {
  return settings;
}

/** The session's certificate verifier, for every verification: `error` undefined when it passed. */
export function recordCertificateVerification(host: string, error: string | undefined): void {
  if (error) tlsErrors.set(host, error);
  else tlsErrors.delete(host);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** A feed hit that should stop this navigation — `null` when unlisted or that entry was bypassed. */
export function knownBadRefusal(url: string): SiteKnownBad | null {
  const hit = reputationFeeds().match(url);
  return hit && !knownBadBypassMatches.has(hit.match) ? hit : null;
}

function isKnownBadBypassed(url: string): boolean {
  const hit = reputationFeeds().match(url);
  return hit !== null && knownBadBypassMatches.has(hit.match);
}

/** The user proceeded past a certificate interstitial for `url`'s host this session. */
export function isCertificateBypassed(url: string): boolean {
  const host = hostOf(url);
  return host !== null && certificateBypassHosts.has(host);
}

export type InterstitialKind = { reason: 'certificate' } | { reason: 'known-bad'; match: string };

/**
 * Lifts one interstitial until the app quits: a certificate one for its host, a known-bad one for
 * the feed entry that matched. `false` (nothing lifted) when the Settings switch is off.
 */
export function bypassInterstitial(url: string, kind: InterstitialKind): boolean {
  if (!settings.allowProceed) return false;
  if (kind.reason === 'known-bad') {
    knownBadBypassMatches.add(kind.match);
    return true;
  }
  const host = hostOf(url);
  if (!host) return false;
  certificateBypassHosts.add(host);
  return true;
}

export function resetSiteSafetyForTests(): void {
  feeds?.dispose();
  feeds = null;
  tracker = null;
  settings = DEFAULT_SETTINGS;
  tlsErrors.clear();
  certificateBypassHosts.clear();
  knownBadBypassMatches.clear();
  emitVerdict = () => {};
}
