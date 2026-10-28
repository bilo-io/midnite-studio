import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { LockedPackage } from '../lockfiles/types';

/** The fetch Guard feeds receive. The host passes the egress-gated one (Phase 115 A); tests pass a recording fake. */
export type FeedFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export const OSV_BASE = 'https://api.osv.dev';
const BATCH = 500;
const MAX_PAGES = 20;

const AdvisorySchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()).optional(),
  summary: z.string().optional(),
  details: z.string().optional(),
  modified: z.string().optional(),
  withdrawn: z.string().optional(),
  severity: z.array(z.object({ type: z.string().optional(), score: z.string().optional() })).optional(),
  database_specific: z.object({ severity: z.string().optional() }).passthrough().optional(),
  affected: z
    .array(
      z.object({
        package: z.object({ name: z.string(), ecosystem: z.string() }).optional(),
        ranges: z.array(z.object({ type: z.string().optional(), events: z.array(z.record(z.string(), z.string())).optional() })).optional(),
      }),
    )
    .optional(),
});
export type GuardOsvAdvisory = z.infer<typeof AdvisorySchema>;

const BatchResponseSchema = z.object({
  results: z.array(
    z.object({
      vulns: z.array(z.object({ id: z.string(), modified: z.string().optional() })).optional(),
      next_page_token: z.string().optional(),
    }),
  ),
});

export const osvKey = (p: Pick<LockedPackage, 'ecosystem' | 'name' | 'version'>): string => `${p.ecosystem}:${p.name}@${p.version}`;

/** Fixed versions an advisory lists for one package. */
export function fixedVersions(advisory: GuardOsvAdvisory, ecosystem: string, name: string): string[] {
  const out = new Set<string>();
  for (const a of advisory.affected ?? []) {
    if (a.package && (a.package.name !== name || a.package.ecosystem !== ecosystem)) continue;
    for (const r of a.ranges ?? []) {
      if (r.type !== 'ECOSYSTEM' && r.type !== 'SEMVER') continue; // GIT ranges carry commit SHAs
      for (const e of r.events ?? []) if (e.fixed) out.add(e.fixed);
    }
  }
  return [...out];
}

export interface OsvClientOptions {
  fetch: FeedFetch;
  /** `<userData>/security/feeds/osv`. Advisories are cached here by id and `modified`. */
  cacheDir: string;
}

export interface OsvClient {
  /** Advisories per package, keyed by {@link osvKey}. Packages with none are absent. A failed call throws. */
  query(packages: readonly LockedPackage[]): Promise<Record<string, GuardOsvAdvisory[]>>;
}

export function createOsvClient(options: OsvClientOptions): OsvClient {
  const { fetch: doFetch, cacheDir } = options;

  async function readCache(id: string, modified: string | undefined): Promise<GuardOsvAdvisory | null> {
    try {
      const parsed = AdvisorySchema.safeParse(JSON.parse(await readFile(join(cacheDir, `${encodeURIComponent(id)}.json`), 'utf8')));
      if (parsed.success && modified !== undefined && parsed.data.modified === modified) return parsed.data;
    } catch {
      // miss
    }
    return null;
  }

  async function hydrate(id: string, modified: string | undefined): Promise<GuardOsvAdvisory | null> {
    const cached = await readCache(id, modified);
    if (cached) return cached;
    const res = await doFetch(`${OSV_BASE}/v1/vulns/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`OSV vulns/${id}: HTTP ${res.status}`);
    const parsed = AdvisorySchema.safeParse(await res.json());
    if (!parsed.success) return null;
    try {
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      const file = join(cacheDir, `${encodeURIComponent(id)}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(parsed.data), 'utf8');
      await rename(`${file}.tmp`, file);
    } catch {
      // cache is best-effort
    }
    return parsed.data;
  }

  async function queryChunk(chunk: readonly LockedPackage[]): Promise<Map<string, Map<string, string | undefined>>> {
    const hits = new Map<string, Map<string, string | undefined>>();
    let pending = chunk.map((p) => ({ p, token: undefined as string | undefined }));
    for (let page = 0; page < MAX_PAGES && pending.length > 0; page++) {
      const res = await doFetch(`${OSV_BASE}/v1/querybatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          queries: pending.map(({ p, token }) => ({
            package: { name: p.name, ecosystem: p.ecosystem },
            version: p.version,
            ...(token ? { page_token: token } : {}),
          })),
        }),
      });
      if (!res.ok) throw new Error(`OSV querybatch: HTTP ${res.status}`);
      const parsed = BatchResponseSchema.parse(await res.json());
      const next: typeof pending = [];
      parsed.results.forEach((r, i) => {
        const entry = pending[i];
        if (!entry) return;
        const key = osvKey(entry.p);
        const ids = hits.get(key) ?? new Map<string, string | undefined>();
        for (const v of r.vulns ?? []) ids.set(v.id, v.modified);
        if (ids.size > 0) hits.set(key, ids);
        if (r.next_page_token) next.push({ p: entry.p, token: r.next_page_token });
      });
      pending = next;
    }
    return hits;
  }

  return {
    async query(packages) {
      const unique = [...new Map(packages.map((p) => [osvKey(p), p])).values()];
      const hits = new Map<string, Map<string, string | undefined>>();
      for (let i = 0; i < unique.length; i += BATCH) {
        for (const [k, v] of await queryChunk(unique.slice(i, i + BATCH))) hits.set(k, v);
      }
      const advisories = new Map<string, GuardOsvAdvisory | null>();
      const out: Record<string, GuardOsvAdvisory[]> = {};
      for (const [key, ids] of hits) {
        for (const [id, modified] of ids) {
          if (!advisories.has(id)) advisories.set(id, await hydrate(id, modified));
          const adv = advisories.get(id);
          if (adv && !adv.withdrawn) (out[key] ??= []).push(adv);
        }
      }
      return out;
    },
  };
}
