/**
 * Memoisation for suite discovery — the `stats-cache.ts` shape, minus the
 * ref-tip digest: there is no equally cheap "has anything changed" signal for
 * a handful of `package.json`/`moon.yml` files, so a short TTL plus an
 * explicit `invalidate(repoId)` (the watcher's hook, once wired) is the
 * proportionate answer rather than inventing one.
 */

type Entry<T> = { value: T; storedAt: number };

export type DiscoveryCache<T> = {
  get: (repoId: string) => T | undefined;
  set: (repoId: string, value: T) => void;
  invalidate: (repoId: string) => void;
  clear: () => void;
  readonly size: number;
};

/** Config files change while the user is looking at them far less often than
 *  refs move, so a longer window than stats' 5 minutes is fine. */
export const DISCOVERY_TTL_MS = 60_000;
export const DISCOVERY_CACHE_MAX = 32;

export function createDiscoveryCache<T>(
  options: { now?: () => number; ttlMs?: number; max?: number } = {},
): DiscoveryCache<T> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DISCOVERY_TTL_MS;
  const max = options.max ?? DISCOVERY_CACHE_MAX;
  const entries = new Map<string, Entry<T>>();

  return {
    get size() {
      return entries.size;
    },
    get(repoId) {
      const entry = entries.get(repoId);
      if (!entry) return undefined;
      if (now() - entry.storedAt > ttlMs) {
        entries.delete(repoId);
        return undefined;
      }
      entries.delete(repoId);
      entries.set(repoId, entry);
      return entry.value;
    },
    set(repoId, value) {
      entries.delete(repoId);
      entries.set(repoId, { value, storedAt: now() });
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    invalidate(repoId) {
      entries.delete(repoId);
    },
    clear() {
      entries.clear();
    },
  };
}
