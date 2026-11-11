import { RELEASE_CHANGELOG_RAW_URL, extractLatestSections } from '@midnite/studio-shared/release';

import type { ChangelogResult } from '../common/bridge';

/** How many released sections the launcher keeps from the changelog. */
export const CHANGELOG_KEEP = 3;
const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;

let cache: { at: number; result: ChangelogResult } | null = null;

/** Test seam: forget the in-memory copy. */
export function resetChangelogCache(): void {
  cache = null;
}

/**
 * The newest released sections of Midnite Studio's public changelog mirror. Cached in memory for
 * ten minutes; a failed fetch is never cached (offline is transient) and never throws.
 */
export async function fetchChangelog(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ChangelogResult> {
  if (cache && now() - cache.at < TTL_MS) return cache.result;
  try {
    const res = await fetchImpl(RELEASE_CHANGELOG_RAW_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { sections: [], error: `The changelog answered ${res.status}.` };
    const sections = extractLatestSections(await res.text(), CHANGELOG_KEEP);
    const result: ChangelogResult = { sections, error: null };
    if (sections.length > 0) cache = { at: now(), result };
    return result;
  } catch {
    return { sections: [], error: 'Could not reach the changelog — offline?' };
  }
}
