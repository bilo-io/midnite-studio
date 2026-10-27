import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { FeedFetch } from './osv';

export const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

export const KevEntrySchema = z.object({
  cveID: z.string(),
  vendorProject: z.string().optional(),
  product: z.string().optional(),
  dueDate: z.string().optional(),
  knownRansomwareCampaignUse: z.string().optional(),
});
export type KevEntry = z.infer<typeof KevEntrySchema>;

export const KevFeedSchema = z.object({ vulnerabilities: z.array(z.unknown()) });

/** Validates the feed entry by entry, so one malformed record loses only itself. */
export function parseKevFeed(raw: unknown): Record<string, KevEntry> {
  const feed = KevFeedSchema.safeParse(raw);
  if (!feed.success) return {};
  const out: Record<string, KevEntry> = {};
  for (const item of feed.data.vulnerabilities) {
    const e = KevEntrySchema.safeParse(item);
    if (e.success) out[e.data.cveID] = e.data;
  }
  return out;
}

export interface KevOptions {
  fetch: FeedFetch;
  /** `<userData>/security/feeds/kev`. */
  cacheDir: string;
}

/**
 * CISA's KEV catalog, downloaded at most once a day: `If-Modified-Since` on the cached copy, a 304 reuses it,
 * and a failed download falls back to the cache rather than to "nothing is exploited".
 */
export async function loadKev(options: KevOptions): Promise<Record<string, KevEntry>> {
  const file = join(options.cacheDir, 'kev.json');
  const metaFile = join(options.cacheDir, 'kev.meta.json');
  let cachedRaw: unknown = null;
  let lastModified: string | undefined;
  try {
    cachedRaw = JSON.parse(await readFile(file, 'utf8'));
    lastModified = (JSON.parse(await readFile(metaFile, 'utf8')) as { lastModified?: string }).lastModified;
  } catch {
    // first run
  }
  try {
    const res = await options.fetch(KEV_URL, { headers: cachedRaw && lastModified ? { 'if-modified-since': lastModified } : {} });
    if (res.status === 304 && cachedRaw) return parseKevFeed(cachedRaw);
    if (res.ok) {
      const body = await res.json();
      const parsed = parseKevFeed(body);
      if (Object.keys(parsed).length > 0) {
        try {
          await mkdir(options.cacheDir, { recursive: true, mode: 0o700 });
          await writeFile(`${file}.tmp`, JSON.stringify(body), 'utf8');
          await rename(`${file}.tmp`, file);
          await writeFile(metaFile, JSON.stringify({ lastModified: res.headers.get('last-modified') ?? undefined }), 'utf8');
        } catch {
          // cache is best-effort
        }
        return parsed;
      }
    }
  } catch {
    // network failure: fall through to the cache
  }
  return cachedRaw ? parseKevFeed(cachedRaw) : {};
}
