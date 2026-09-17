import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LayoutId } from './layout';
import type { LayoutPositions } from './types';

/**
 * Bumped whenever the *shape* of what gets cached changes — a field added to
 * or removed from {@link LeanNode}/{@link LeanLink}, or the layout algorithm's
 * settings change in a way that moves coordinates. `built_at_commit` alone
 * invalidates a stale *graph*; this invalidates a stale *cache format* even
 * when the commit hasn't moved, so a shipped code change never reads a cache
 * entry written by the version before it.
 */
/** `2` (Theme E): {@link LeanLink} gained `confidence` — see `projection.ts`. */
export const PROJECTION_FORMAT_VERSION = 2;

export type LayoutCacheEntry = {
  builtAtCommit: string;
  projectionVersion: number;
  /** Which layout produced `positions` (Phase 89 Theme E) — part of the cache key below, not read back off the entry by any caller today, but recorded for the same reason `builtAtCommit`/`projectionVersion` are: the entry should be self-describing. */
  layoutId: LayoutId;
  nodeCount: number;
  linkCount: number;
  positions: LayoutPositions;
};

/**
 * The cache key: `built_at_commit` plus the projection format version plus
 * the layout id (Theme A, Decision — cache lives in the app's `userData`, not
 * `graphify-out/`, so a `graphify uninstall --purge` or an incremental update
 * never touches it and this package never confuses graphify's own
 * directory).
 *
 * A repo reopened at the same graph, the same app version and the same
 * layout is a key hit — instant. `graphify update .` changes `built_at_commit`
 * and invalidates exactly; a knowledge-package release changes
 * `PROJECTION_FORMAT_VERSION` and invalidates exactly; switching layouts
 * changes `layoutId` and invalidates exactly — each independent of whether
 * the other two moved, so switching from circlepack to hierarchical and back
 * to circlepack is a cache hit the second time, not a third cold pass (Theme
 * E's own guarantee).
 */
export function layoutCacheKey(
  builtAtCommit: string,
  projectionVersion: number,
  layoutId: LayoutId,
): string {
  return `${builtAtCommit}:${projectionVersion}:${layoutId}`;
}

/**
 * Filesystem-safe, stable name for one repo's cache entry — repo ids contain
 * `/` and `:`. Scoped by `layoutId` too (Theme E): one file per (repo,
 * layout) pair, not one file per repo, so writing a `circlepack` entry never
 * evicts an already-cached `force-atlas2` one — switching layouts back and
 * forth is then a cache hit every time after the first, per layout, rather
 * than the single most-recently-written layout winning the repo's one slot.
 */
function cacheFileName(repoId: string, layoutId: LayoutId): string {
  const digest = createHash('sha256').update(`${repoId}:${layoutId}`).digest('hex').slice(0, 16);
  return `${digest}.json`;
}

/**
 * Read a repo's cached layout for `layoutId`, if it exists and matches the
 * requested key. A missing file, an unparseable file, or a key mismatch (a
 * stale cache, from an older commit or an older projection format) all
 * resolve to `null` rather than throwing — a cache is an optimization, never
 * a source of truth a caller has to guard separately.
 */
export async function readLayoutCache(
  cacheDir: string,
  repoId: string,
  layoutId: LayoutId,
  key: string,
): Promise<LayoutCacheEntry | null> {
  const path = join(cacheDir, cacheFileName(repoId, layoutId));
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  try {
    const entry = JSON.parse(raw) as LayoutCacheEntry;
    if (layoutCacheKey(entry.builtAtCommit, entry.projectionVersion, entry.layoutId) !== key) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Write a repo's layout cache, creating `cacheDir` if needed.
 *
 * Written to a temp path and renamed into place — `rename` is atomic on the
 * same filesystem, so a crash mid-write (or a repo switch that starts a
 * second write for a different repo, since each repo has its own file) can
 * never leave a half-written, unparseable cache entry for the NEXT read to
 * trip over.
 *
 * The temp name carries a random suffix as well as the pid: two windows
 * asking for the same repo's graph at once (the main window and a popout,
 * or a Retry racing the call it retried) both reach this write from the
 * SAME process, and a pid-only temp name had them writing one file and the
 * second `rename` failing with ENOENT.
 */
export async function writeLayoutCache(
  cacheDir: string,
  repoId: string,
  entry: LayoutCacheEntry,
): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const path = join(cacheDir, cacheFileName(repoId, entry.layoutId));
  const tmpPath = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entry), 'utf8');
  try {
    await rename(tmpPath, path);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
