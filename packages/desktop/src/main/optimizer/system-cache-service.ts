import { lstat } from 'node:fs/promises';

import type { Ecosystem, SystemCacheItem, SystemScanResult } from '@midnite/studio-shared';

import { confineAllowlist, describeFsError } from '../fs-scope-write';
import { defaultLogger, type Logger } from '../log';
import { dirBytes, newWalkState, type CleanOutcome } from './scan-service';
import {
  DEFAULT_SYSTEM_CACHE_ENTRIES,
  resolveSystemCacheEntries,
  type ResolvedSystemCacheEntry,
} from './system-cache-registry';

/**
 * Phase 73 Theme B — the system-wide scan/clean pair, mirroring
 * `scan-service.ts`'s own shape over the allowlist instead of `knownRoots()`.
 * `runReclaimCommand` (Theme D) lives in this same file once it lands.
 */

/** Matches Phase 72 Theme E's own fairness number (`MAX_ENTRIES_PER_ROOT`) —
 *  a shared `WalkState` would let one enormous entry (Xcode DerivedData,
 *  routinely hundreds of thousands of files) consume the whole per-scan
 *  budget and make every entry scanned after it report zero. Each entry gets
 *  its own fresh `newWalkState()`, so that cross-entry starvation cannot
 *  happen at all; this is a second, per-entry ceiling on top of that. */
export const MAX_ENTRIES_PER_SYSTEM_ENTRY = 50_000;

/**
 * Sizes one resolved entry with its own walk state, so a directory that hits
 * `budget` still leaves every other entry's own count untouched. Exported
 * (rather than folded into `scanSystemCaches`) so the approximate-flag
 * behaviour can be exercised directly against a small injected budget — a
 * fixture proving the real `MAX_ENTRIES_PER_SYSTEM_ENTRY` (50,000) would mean
 * writing 50,001 real files just to run one test.
 */
export async function sizeOneEntry(
  resolved: ResolvedSystemCacheEntry,
  budget: number,
  signal: AbortSignal,
  log: Logger,
): Promise<SystemCacheItem> {
  const state = newWalkState();
  const bytes = await dirBytes(resolved.path, state, signal, log);
  return {
    path: resolved.path,
    bytes,
    approximate: state.entriesWalked >= budget,
    entryId: resolved.entry.id,
    ecosystem: resolved.entry.ecosystem,
    reclaim: resolved.entry.reclaim,
    label: resolved.entry.label,
    producer: resolved.entry.producer,
  };
}

export type ScanSystemCachesOptions = {
  signal: AbortSignal;
  /** A stream, not a return value — same contract as `scanWorkspace`'s. */
  onProgress: (done: number, total: number) => void;
  log?: Logger;
};

export async function scanSystemCaches(opts: ScanSystemCachesOptions): Promise<SystemScanResult> {
  const log = opts.log ?? defaultLogger;
  const resolvedEntries = await resolveSystemCacheEntries(DEFAULT_SYSTEM_CACHE_ENTRIES, log);

  const items: SystemCacheItem[] = [];
  const byEcosystem = {} as Record<Ecosystem, number>;
  let totalBytes = 0;
  let approximate = false;
  let done = 0;
  const total = resolvedEntries.length;

  for (const resolved of resolvedEntries) {
    if (opts.signal.aborted) break;

    const item = await sizeOneEntry(resolved, MAX_ENTRIES_PER_SYSTEM_ENTRY, opts.signal, log);
    items.push(item);
    totalBytes += item.bytes;
    byEcosystem[item.ecosystem] = (byEcosystem[item.ecosystem] ?? 0) + item.bytes;
    if (item.approximate) approximate = true;

    done += 1;
    opts.onProgress(done, total);
  }

  return { totalBytes, approximate, byEcosystem, items };
}

export async function cleanSystemCaches(
  entryIds: readonly string[],
  trash: (path: string) => Promise<void>,
  log: Logger = defaultLogger,
): Promise<CleanOutcome> {
  let freedBytes = 0;
  const skipped: { path: string; reason: string }[] = [];

  // Fresh at clean time — re-applies the symlink and home-containment
  // refusals rather than trusting a path the renderer remembers from its
  // last scan (the TOCTOU rule Theme B's request shape exists to close).
  const resolvedEntries = await resolveSystemCacheEntries(DEFAULT_SYSTEM_CACHE_ENTRIES, log);
  const byEntryId = new Map<string, ResolvedSystemCacheEntry>(
    resolvedEntries.map((r) => [r.entry.id, r]),
  );
  const allowed = resolvedEntries.map((r) => r.path);

  for (const entryId of entryIds) {
    const resolved = byEntryId.get(entryId);
    if (!resolved) {
      skipped.push({ path: entryId, reason: 'not a known system cache' });
      continue;
    }

    let stat;
    try {
      stat = await lstat(resolved.path);
    } catch {
      skipped.push({ path: resolved.path, reason: 'no longer exists' });
      continue;
    }
    if (stat.isSymbolicLink()) {
      skipped.push({ path: resolved.path, reason: 'is now a symlink' });
      continue;
    }

    const confined = await confineAllowlist(allowed, resolved.path);
    if (confined === null) {
      skipped.push({ path: resolved.path, reason: 'no longer resolves under the registry' });
      continue;
    }

    const abort = new AbortController();
    const bytes = await dirBytes(confined, newWalkState(), abort.signal, log);

    try {
      await trash(confined);
      freedBytes += bytes;
    } catch (error) {
      skipped.push({ path: confined, reason: describeFsError(error) });
    }
  }

  return { freedBytes, skipped };
}
