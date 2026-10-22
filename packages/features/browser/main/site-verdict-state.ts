import {
  COMMONLY_IMPERSONATED_HOSTS,
  SITE_VERDICT_TRACKER_HOST_CAP,
  SITE_VERDICT_URL_CAP,
  displayHost,
  emptySiteVerdict,
  findLookalike,
  isLoopbackHost,
  type SiteKnownBad,
  type SiteVerdict,
} from '@midnite/studio-shared';

import { vulnerableLibraryForUrl } from './vulnerable-libraries';

/**
 * The one per-tab `SiteVerdict` main keeps (Phase 117 Theme C) — every rule that judges a site
 * writes here, and every write that changes something pushes the whole verdict to the renderer.
 *
 * - **Navigation commit** ({@link SiteVerdictTracker.commit}) starts a fresh verdict: TLS (from the
 *   certificate verifier's record), lookalike, known-bad and the reputation state are judged once
 *   from the URL; the per-page findings start empty.
 * - **Each completed subresource** ({@link SiteVerdictTracker.requestCompleted}, fed by the
 *   session's `webRequest.onCompleted`) can add mixed content, a vulnerable script or an insecure
 *   POST.
 * - **Theme E** calls {@link SiteVerdictTracker.noteTrackerBlocked} for each request its blocklist
 *   refuses, which feeds the badge's counter. **Theme D** reads
 *   {@link SiteVerdictTracker.verdictForWebContents} to refuse a download from a `danger` origin.
 *   **Theme F** sets `insecureForm` (and may raise `lookalike`) through {@link SiteVerdictTracker.patch}.
 *
 * No Electron here — `webContentsId` is a number, the clock and the feeds are injected — so the
 * whole state machine runs under bare vitest.
 */

export type CompletedRequest = {
  webContentsId?: number;
  url: string;
  method: string;
  /** Electron's `resourceType`: `mainFrame`, `subFrame`, `script`, `image`, `xhr`, … */
  resourceType: string;
};

export type SiteVerdictContext = {
  /** The reputation feeds' current answer for a URL, and whether any feed is loaded at all. */
  feeds: { match(url: string): SiteKnownBad | null; reputation(): 'checked' | 'unavailable' };
  /** The certificate verifier's last failure for a host, if any. */
  tlsErrorFor(host: string): string | undefined;
  /** The user proceeded past this host's interstitial this session. */
  isBypassed(host: string): boolean;
  /** Push a changed verdict to the tab's window. */
  emit(tabId: string, verdict: SiteVerdict): void;
};

export type SiteVerdictTracker = {
  /** Associates a tab with its view's `webContents.id`, for request-level events. */
  bind(tabId: string, webContentsId: number): void;
  /** Drops a closed or discarded tab. */
  forget(tabId: string): void;
  /** A main-frame navigation committed: build, store and emit a fresh verdict. */
  commit(tabId: string, url: string): SiteVerdict;
  requestCompleted(details: CompletedRequest): void;
  /** Theme E: one request refused by the tracker blocklist on this page. */
  noteTrackerBlocked(webContentsId: number, host: string): void;
  /** Theme F (and future rules): merge findings into the tab's verdict and emit it. */
  patch(tabId: string, patch: Partial<SiteVerdict>): void;
  verdict(tabId: string): SiteVerdict | undefined;
  verdictForWebContents(webContentsId: number): SiteVerdict | undefined;
  /** Hosts a confusable is compared against (seed + Vault sign-ins + visited this session). */
  addKnownHosts(hosts: Iterable<string>): void;
  knownHosts(): ReadonlySet<string>;
};

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function createSiteVerdictTracker(ctx: SiteVerdictContext): SiteVerdictTracker {
  const verdicts = new Map<string, SiteVerdict>();
  const tabByWebContents = new Map<number, string>();
  const known = new Set<string>(COMMONLY_IMPERSONATED_HOSTS);

  const tabFor = (webContentsId: number | undefined) =>
    webContentsId === undefined ? undefined : tabByWebContents.get(webContentsId);

  function store(tabId: string, next: SiteVerdict): void {
    verdicts.set(tabId, next);
    ctx.emit(tabId, next);
  }

  const tracker: SiteVerdictTracker = {
    bind(tabId, webContentsId) {
      tabByWebContents.set(webContentsId, tabId);
    },

    forget(tabId) {
      verdicts.delete(tabId);
      for (const [wcId, id] of tabByWebContents) if (id === tabId) tabByWebContents.delete(wcId);
    },

    commit(tabId, url) {
      const verdict = emptySiteVerdict(url);
      const parsed = parse(url);
      if (parsed && verdict.origin) {
        const host = parsed.hostname;
        const lookalike = findLookalike(host, known);
        const tlsError = parsed.protocol === 'https:' ? ctx.tlsErrorFor(host) : undefined;
        const knownBad = ctx.feeds.match(url);
        verdict.displayHost = lookalike ? lookalike.displayHost : displayHost(host, known);
        verdict.lookalike = lookalike;
        verdict.knownBad = knownBad;
        verdict.reputation = ctx.feeds.reputation();
        verdict.bypassed = ctx.isBypassed(host);
        if (tlsError) {
          verdict.tls = 'error';
          verdict.tlsError = tlsError;
        }
        // A host the user reached and that is not itself a lookalike becomes one a later
        // confusable is compared against ("recent history" — this session's, in memory only).
        if (!lookalike && !knownBad && !isLoopbackHost(host)) known.add(host.replace(/^www\./, ''));
      }
      store(tabId, verdict);
      return verdict;
    },

    requestCompleted(details) {
      if (details.resourceType === 'mainFrame') return;
      const tabId = tabFor(details.webContentsId);
      const current = tabId ? verdicts.get(tabId) : undefined;
      if (!tabId || !current) return;
      const target = parse(details.url);
      if (!target) return;
      const next = { ...current };
      let changed = false;

      const plainHttp = target.protocol === 'http:' && !isLoopbackHost(target.hostname);
      if (plainHttp && current.origin.startsWith('https:') && !current.mixedContentUrls.includes(details.url)) {
        next.mixedContent = true;
        if (current.mixedContentUrls.length < SITE_VERDICT_URL_CAP) next.mixedContentUrls = [...current.mixedContentUrls, details.url];
        changed = true;
      }
      if (plainHttp && details.method.toUpperCase() !== 'GET' && details.method.toUpperCase() !== 'HEAD' && !current.insecureForm) {
        next.insecureForm = true;
        changed = true;
      }
      if (details.resourceType === 'script') {
        const lib = vulnerableLibraryForUrl(details.url);
        if (lib && !current.vulnerableLibs.some((l) => l.library === lib.library && l.version === lib.version)) {
          next.vulnerableLibs = [...current.vulnerableLibs, lib];
          changed = true;
        }
      }
      if (changed) store(tabId, next);
    },

    noteTrackerBlocked(webContentsId, host) {
      const tabId = tabFor(webContentsId);
      const current = tabId ? verdicts.get(tabId) : undefined;
      if (!tabId || !current) return;
      const hosts =
        current.trackerHosts.includes(host) || current.trackerHosts.length >= SITE_VERDICT_TRACKER_HOST_CAP
          ? current.trackerHosts
          : [...current.trackerHosts, host];
      store(tabId, { ...current, trackersBlocked: current.trackersBlocked + 1, trackerHosts: hosts });
    },

    patch(tabId, patch) {
      const current = verdicts.get(tabId);
      if (current) store(tabId, { ...current, ...patch });
    },

    verdict: (tabId) => verdicts.get(tabId),
    verdictForWebContents: (webContentsId) => {
      const tabId = tabFor(webContentsId);
      return tabId ? verdicts.get(tabId) : undefined;
    },
    addKnownHosts(hosts) {
      for (const host of hosts) {
        const h = host.toLowerCase().replace(/^\./, '').replace(/^www\./, '');
        if (h) known.add(h);
      }
    },
    knownHosts: () => known,
  };
  return tracker;
}
