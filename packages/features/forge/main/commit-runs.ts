import {
  hasActiveRun,
  type Forge,
  type ForgeCliStatus,
  type ForgeCommitRunsResult,
  type ForgeRun,
} from '@midnite/studio-shared';

import type { ForgeAdapter } from './adapter';

/**
 * CI runs per commit, for the git graph's CI column — batched, cached, and
 * provider-blind.
 *
 * The graph asks for the ~25 shas of the page it is showing. Answering that
 * with one subprocess per sha would put 25 `gh` calls behind every scroll, so a
 * batch is answered in two passes:
 *
 * 1. **The recent listing** — one `adapter.listRuns` page of the repository's
 *    newest runs, shared by every sha in the batch and by every batch for
 *    {@link RECENT_TTL_MS}. Almost every commit near a branch tip is in it.
 * 2. **Per-commit fallback** — only for a sha the recent page did not reach,
 *    and only through the adapter's optional `listRunsForCommit` (GitHub:
 *    `gh run list --commit`), at most {@link FALLBACK_CONCURRENCY} at a time.
 *    A provider without it answers from its recent runs alone.
 *
 * Every answer is cached per sha, with a TTL that depends on what it says:
 * anything still queued or running is re-read after {@link ACTIVE_TTL_MS}, a
 * settled answer is kept for {@link SETTLED_TTL_MS}. "No runs" from the recent
 * pass is kept only {@link FRESH_EMPTY_TTL_MS}, because a commit pushed a
 * second ago has no run *yet*; "no runs" from the per-commit fallback is an
 * old commit, and is as settled as it gets.
 *
 * Every effect is injected so `commit-runs.test.ts` can drive the clock and
 * the adapter. Nothing here throws: a failure is an envelope with `error` set
 * and whatever the cache already knew.
 */

export const RECENT_LIMIT = 100;
export const RECENT_TTL_MS = 10_000;
export const ACTIVE_TTL_MS = 10_000;
export const FRESH_EMPTY_TTL_MS = 60_000;
export const SETTLED_TTL_MS = 10 * 60_000;
export const FALLBACK_CONCURRENCY = 4;
/** Per-repo cache ceiling — far more commits than anyone scrolls through in one session. */
export const PER_REPO_CACHE_MAX = 5_000;

type Entry = { runs: ForgeRun[]; at: number; ttl: number };
type Recent = { at: number; promise: Promise<RecentResult> };
type RecentResult = { cli: ForgeCliStatus; runs: ForgeRun[]; error: string | null };

export type CommitRunsDeps = {
  resolve: (repoId: string) => Promise<{ forge: Forge; adapter: ForgeAdapter } | null>;
  /** What a repository with no forge reports — `forge-handlers.ts`'s `noForgeStatus`. */
  noForge: () => ForgeCliStatus;
  now?: () => number;
};

export type CommitRunsService = {
  lookup: (repoId: string, shas: readonly string[]) => Promise<ForgeCommitRunsResult>;
  /** Drop every cached answer — for tests, and for a hard refresh. */
  clear: () => void;
};

const READY: ForgeCliStatus = { reason: 'ready', binPath: null, hint: '' };

function ttlFor(runs: readonly ForgeRun[], source: 'recent' | 'commit'): number {
  if (hasActiveRun(runs)) return ACTIVE_TTL_MS;
  if (runs.length === 0 && source === 'recent') return FRESH_EMPTY_TTL_MS;
  return SETTLED_TTL_MS;
}

/** Run `task` over `items`, `limit` at a time. */
async function mapLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createCommitRunsService(deps: CommitRunsDeps): CommitRunsService {
  const now = deps.now ?? Date.now;
  const bySha = new Map<string, Map<string, Entry>>();
  const recent = new Map<string, Recent>();

  const cacheFor = (repoId: string): Map<string, Entry> => {
    let cache = bySha.get(repoId);
    if (!cache) {
      cache = new Map();
      bySha.set(repoId, cache);
    }
    return cache;
  };

  const remember = (cache: Map<string, Entry>, sha: string, runs: ForgeRun[], source: 'recent' | 'commit') => {
    cache.delete(sha);
    cache.set(sha, { runs, at: now(), ttl: ttlFor(runs, source) });
    if (cache.size > PER_REPO_CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  };

  /** One recent listing per repo per TTL, shared by concurrent batches. */
  const recentRuns = (repoId: string, forge: Forge, adapter: ForgeAdapter): Promise<RecentResult> => {
    const held = recent.get(repoId);
    if (held && now() - held.at < RECENT_TTL_MS) return held.promise;
    const promise = adapter
      .listRuns(forge, { limit: RECENT_LIMIT })
      .then((result) => ({ cli: result.cli, runs: result.runs, error: result.error }))
      .catch((error: unknown): RecentResult => ({ cli: READY, runs: [], error: message(error) }));
    recent.set(repoId, { at: now(), promise });
    // A failed listing must not be served for the next ten seconds as though
    // it were an answer — drop it so the next batch asks again.
    void promise.then((result) => {
      if ((result.error !== null || result.cli.reason !== 'ready') && recent.get(repoId)?.promise === promise) {
        recent.delete(repoId);
      }
    });
    return promise;
  };

  async function lookup(repoId: string, shas: readonly string[]): Promise<ForgeCommitRunsResult> {
    const out: Record<string, ForgeRun[]> = {};
    let resolved: Awaited<ReturnType<CommitRunsDeps['resolve']>>;
    try {
      resolved = await deps.resolve(repoId);
    } catch (error) {
      return { cli: deps.noForge(), runs: out, error: message(error) };
    }
    if (!resolved) return { cli: deps.noForge(), runs: out, error: null };
    const { forge, adapter } = resolved;

    const cache = cacheFor(repoId);
    const missing: string[] = [];
    for (const sha of new Set(shas)) {
      const hit = cache.get(sha);
      if (hit && now() - hit.at < hit.ttl) out[sha] = hit.runs;
      else missing.push(sha);
    }
    if (missing.length === 0) return { cli: READY, runs: out, error: null };

    const index = await recentRuns(repoId, forge, adapter);
    if (index.cli.reason !== 'ready' || index.error !== null) {
      return { cli: index.cli, runs: out, error: index.error };
    }

    const byHead = new Map<string, ForgeRun[]>();
    for (const run of index.runs) {
      if (run.headSha === null) continue;
      const list = byHead.get(run.headSha);
      if (list) list.push(run);
      else byHead.set(run.headSha, [run]);
    }
    // A page shorter than the limit is the repository's whole run history, so
    // a sha absent from it has no runs — definitively, not "not reached".
    const exhaustive = index.runs.length < RECENT_LIMIT;

    const fallback: string[] = [];
    for (const sha of missing) {
      const runs = byHead.get(sha);
      if (runs) {
        remember(cache, sha, runs, 'recent');
        out[sha] = runs;
      } else if (exhaustive || !adapter.listRunsForCommit) {
        remember(cache, sha, [], 'recent');
        out[sha] = [];
      } else {
        fallback.push(sha);
      }
    }

    const perCommit = adapter.listRunsForCommit?.bind(adapter);
    let error: string | null = null;
    if (perCommit && fallback.length > 0) {
      await mapLimit(fallback, FALLBACK_CONCURRENCY, async (sha) => {
        try {
          const result = await perCommit(forge, sha);
          if (result.cli.reason !== 'ready' || result.error !== null) {
            error ??= result.error;
            return;
          }
          // Filtered here as well as by the provider: a sha is the one thing a
          // run is matched on, and a provider that ignored the filter would
          // otherwise paint another commit's verdict on this one.
          const runs = result.runs.filter((run) => run.headSha === sha);
          remember(cache, sha, runs, 'commit');
          out[sha] = runs;
        } catch (caught) {
          error ??= message(caught);
        }
      });
    }

    return { cli: index.cli, runs: out, error };
  }

  return {
    lookup,
    clear: () => {
      bySha.clear();
      recent.clear();
    },
  };
}
