import { CHANGELOG_APP_IDS, changelogRawUrl, extractLatestSections, type ChangelogAppId } from '@midnite/studio-shared/release';
import { z } from 'zod';

import type { ChangelogResult } from '../common/bridge';

/** How many released sections the launcher keeps from a changelog. */
export const CHANGELOG_KEEP = 3;
const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;

const cache = new Map<ChangelogAppId, { at: number; result: ChangelogResult }>();

/** Test seam: forget every in-memory copy. */
export function resetChangelogCache(): void {
  cache.clear();
}

/**
 * The newest released sections of one app's public changelog mirror. Cached in memory per app for
 * ten minutes; a 404 (the app's first release has not published yet) is `{ sections: [], error: null }`.
 * Only a non-empty answer is cached; a failed fetch never is, and none of it throws.
 */
export async function fetchChangelog(
  app: ChangelogAppId,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ChangelogResult> {
  const hit = cache.get(app);
  if (hit && now() - hit.at < TTL_MS) return hit.result;
  try {
    const res = await fetchImpl(changelogRawUrl(app), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404) return { sections: [], error: null };
    if (!res.ok) return { sections: [], error: `The changelog answered ${res.status}.` };
    const sections = extractLatestSections(await res.text(), CHANGELOG_KEEP);
    const result: ChangelogResult = { sections, error: null };
    if (sections.length > 0) cache.set(app, { at: now(), result });
    return result;
  } catch {
    return { sections: [], error: 'Could not reach the changelog — offline?' };
  }
}

/** The wire payload of `changelogLatest` / `changelogOpen`: one known app id, nothing else. */
export const ChangelogRequestSchema = z.object({ app: z.enum(CHANGELOG_APP_IDS) });

/** `changelogLatest`'s handler body: an unknown payload is an answer, not a fetch and not a throw. */
export async function answerChangelogLatest(raw: unknown, fetchImpl: typeof fetch = fetch): Promise<ChangelogResult> {
  const parsed = ChangelogRequestSchema.safeParse(raw);
  return parsed.success ? fetchChangelog(parsed.data.app, fetchImpl) : { sections: [], error: 'Unknown app.' };
}
