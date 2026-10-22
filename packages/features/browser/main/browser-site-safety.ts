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
 * - **Bypasses** are per host, in memory only — a "proceed for this session" ends with the app.
 */

export type SiteSafetySettings = { allowProceed: boolean; feeds: Record<SiteFeedId, boolean> };

const DEFAULT_SETTINGS: SiteSafetySettings = { allowProceed: false, feeds: { urlhaus: false, openphish: false } };

let settings: SiteSafetySettings = DEFAULT_SETTINGS;
let feeds: ReputationFeedService | null = null;
let tracker: SiteVerdictTracker | null = null;
const tlsErrors = new Map<string, string>();
const bypassedHosts = new Set<string>();
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
      isBypassed: (host) => bypassedHosts.has(host),
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

/** A feed hit that should stop this navigation — `null` when unlisted or bypassed this session. */
export function knownBadRefusal(url: string): SiteKnownBad | null {
  const host = hostOf(url);
  if (!host || bypassedHosts.has(host)) return null;
  return reputationFeeds().match(url);
}

export function isHostBypassed(url: string): boolean {
  const host = hostOf(url);
  return host !== null && bypassedHosts.has(host);
}

/** Lifts the interstitial for `url`'s host until the app quits. `false` when the switch is off. */
export function bypassHostFor(url: string): boolean {
  const host = hostOf(url);
  if (!settings.allowProceed || !host) return false;
  bypassedHosts.add(host);
  return true;
}

export function resetSiteSafetyForTests(): void {
  feeds?.dispose();
  feeds = null;
  tracker = null;
  settings = DEFAULT_SETTINGS;
  tlsErrors.clear();
  bypassedHosts.clear();
  emitVerdict = () => {};
}
