import { z } from 'zod';

import type { StudioRelease } from '../common/bridge';

/** `midnite-studio/version.json` in bilo-io/midnite-apps — written per release by /midnite-release-complete. */
const FeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/),
  releasedAt: z.string().optional(),
  notesUrl: z.string().url().optional(),
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
