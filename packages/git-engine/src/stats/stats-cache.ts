/**
 * Memoisation for the history traversal.
 *
 * **Keyed on a hash of every ref tip, not on HEAD.** The traversal is
 * `--all`, so its answer depends on every branch in the repository — a `git
 * fetch` that moves `origin/main` changes the contributor table while HEAD
 * stands perfectly still. A HEAD-keyed cache would serve the pre-fetch answer
 * indefinitely, and the failure is invisible: the numbers look plausible, they
 * are simply from before.
 *
 * The clock and the ref-tip reader are **injected**, so this module carries no
 * `electron` import and no dependency on a real repository — the
 * `repo-store.ts` pattern, and what lets the eviction rules be unit-tested
 * without a git binary.
 */

export type CacheKey = {
  repoId: string;
  window: string;
  withChurn: boolean;
  /** Digest of every ref tip — see the note above. */
  refDigest: string;
};

type Entry<T> = { value: T; storedAt: number };

export type StatsCache<T> = {
  get: (key: CacheKey) => T | undefined;
  set: (key: CacheKey, value: T) => void;
  /** Drop everything for one repository — the watcher's hook. */
  invalidate: (repoId: string) => void;
  clear: () => void;
  readonly size: number;
};

/**
 * A TTL as well as the digest key, because the digest cannot see everything.
 *
 * Ref tips catch commits, fetches and branch changes. They do not catch a `git
 * gc` (which changes the size figure) or the passage of time (which turns a
 * fresh branch stale). Those are slow-moving enough that a ceiling on staleness
 * is the proportionate answer rather than another key component.
 */
export const STATS_TTL_MS = 5 * 60 * 1000;

/** Bounded so a long session across many repositories cannot grow without limit. */
export const STATS_CACHE_MAX = 32;

export function createStatsCache<T>(options: {
  now?: () => number;
  ttlMs?: number;
  max?: number;
} = {}): StatsCache<T> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? STATS_TTL_MS;
  const max = options.max ?? STATS_CACHE_MAX;
  const entries = new Map<string, Entry<T>>();

  const encode = (key: CacheKey): string =>
    [key.repoId, key.window, key.withChurn ? 'churn' : 'lean', key.refDigest].join('\x00');

  return {
    get size() {
      return entries.size;
    },
    get(key) {
      const id = encode(key);
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (now() - entry.storedAt > ttlMs) {
        entries.delete(id);
        return undefined;
      }
      // Re-insert so Map iteration order is least-recently-used first, which is
      // what makes the eviction below actually evict the coldest entry.
      entries.delete(id);
      entries.set(id, entry);
      return entry.value;
    },
    set(key, value) {
      const id = encode(key);
      entries.delete(id);
      entries.set(id, { value, storedAt: now() });
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    invalidate(repoId) {
      const prefix = `${repoId}\x00`;
      for (const id of [...entries.keys()]) {
        if (id.startsWith(prefix)) entries.delete(id);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

/**
 * A stable digest of the ref tips.
 *
 * Not a cryptographic hash — this only has to change when the refs change, and
 * a sorted join of the sha/name pairs does that exactly. Sorted because
 * `for-each-ref` order is not guaranteed stable across git versions, and an
 * unstable digest would miss the cache on every call.
 */
export function refDigest(rows: readonly { refName: string; sha: string }[]): string {
  return rows
    .map((row) => `${row.refName}:${row.sha}`)
    .sort()
    .join('\n');
}
