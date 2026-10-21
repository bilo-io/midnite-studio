import { z } from 'zod';

import type { StudioRelease } from '../common/bridge';
import { parseCatalog, type Catalog } from '../common/catalog-feed';
import { CATALOG_URL, STUDIO_FEED_URL } from './constants';

/** `midnite-studio/version.json` in bilo-io/midnite-apps — written per release by /midnite-release-complete. */
const FeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/),
  releasedAt: z.string().optional(),
  notesUrl: z.string().url().optional(),
  /** Lowercase hex SHA-256 of the Studio arm64 zip (Phase 91 Theme H); absent on releases before it. */
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});

/** `null` for anything that is not a well-formed feed — a version that fails the pattern never reaches a download URL. */
export function parseFeed(json: unknown): StudioRelease | null {
  const parsed = FeedSchema.safeParse(json);
  if (!parsed.success) return null;
  return {
    version: parsed.data.version,
    releasedAt: parsed.data.releasedAt ?? null,
    notesUrl: parsed.data.notesUrl ?? null,
  };
}

export type FeedResult = { release: StudioRelease; error: null } | { release: null; error: string };

export async function fetchLatestRelease(url: string, fetchImpl: typeof fetch = fetch): Promise<FeedResult> {
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { release: null, error: `The release feed answered ${res.status}.` };
    const release = parseFeed(await res.json());
    return release ? { release, error: null } : { release: null, error: 'No published release yet.' };
  } catch {
    return { release: null, error: 'Could not reach the release feed — offline?' };
  }
}

/** The validated catalog, or `null` when it is missing (404 today), malformed or unreachable — never throws. */
export async function fetchCatalog(url: string = CATALOG_URL, fetchImpl: typeof fetch = fetch): Promise<Catalog | null> {
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return parseCatalog(await res.json());
  } catch {
    return null;
  }
}

export type ReleaseSources = { catalogUrl?: string; feedUrl?: string; fetchImpl?: typeof fetch };

/**
 * Studio's latest release: `catalog.json` when it is published, valid and lists
 * Studio; otherwise the per-app `version.json` feed, exactly as before.
 */
export async function fetchStudioRelease(sources: ReleaseSources = {}): Promise<FeedResult> {
  const catalog = await fetchCatalog(sources.catalogUrl, sources.fetchImpl);
  const studio = catalog?.apps.find((a) => a.id === 'studio');
  if (studio) {
    return {
      release: { version: studio.version, releasedAt: studio.releasedAt ?? null, notesUrl: studio.notesUrl ?? null },
      error: null,
    };
  }
  return fetchLatestRelease(sources.feedUrl ?? STUDIO_FEED_URL, sources.fetchImpl);
}

/**
 * The published SHA-256 of Studio's zip for `version` (Phase 91 Theme H), or
 * `null` when none is published: `catalog.json` carries one per app (built from
 * the uploaded files), then `midnite-studio/version.json`'s `sha256`. `null`
 * means "cannot verify" (an older release, an unreachable feed, or a feed that
 * describes a different version), which the installer reports as a skip rather
 * than a failure, so every already-published version stays installable.
 */
export async function fetchStudioSha256(version: string, sources: ReleaseSources = {}): Promise<string | null> {
  const catalog = await fetchCatalog(sources.catalogUrl, sources.fetchImpl);
  const studio = catalog?.apps.find((a) => a.id === 'studio' && a.version === version);
  if (studio) return studio.sha256;
  try {
    const res = await (sources.fetchImpl ?? fetch)(sources.feedUrl ?? STUDIO_FEED_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const parsed = FeedSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.version !== version || !parsed.data.sha256) return null;
    return parsed.data.sha256.toLowerCase();
  } catch {
    return null;
  }
}
