import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * A tiny JSON cache under `userData/finance/cache/`.
 *
 * The cache is a fallback as much as a speed-up: when a provider is down or
 * rate limiting, `readAny` ignores the TTL so the UI can show the last known
 * data marked stale rather than nothing. Writes are temp-and-rename so a crash
 * never leaves half a file, and a corrupt file reads as a miss.
 */
export type CacheEntry<T> = { fetchedAt: number; source: string | null; value: T };

export type DiskCache = {
  read: <T>(key: string, maxAgeMs: number) => Promise<CacheEntry<T> | null>;
  readAny: <T>(key: string) => Promise<CacheEntry<T> | null>;
  write: <T>(key: string, entry: CacheEntry<T>) => Promise<void>;
};

const safeName = (key: string): string => key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

export function createDiskCache(directory: string, now: () => number = Date.now): DiskCache {
  const fileFor = (key: string): string => join(directory, `${safeName(key)}.json`);

  const readAny = async <T,>(key: string): Promise<CacheEntry<T> | null> => {
    try {
      const parsed = JSON.parse(await readFile(fileFor(key), 'utf8')) as Partial<CacheEntry<T>>;
      if (typeof parsed.fetchedAt !== 'number' || parsed.value === undefined) return null;
      return { fetchedAt: parsed.fetchedAt, source: parsed.source ?? null, value: parsed.value };
    } catch {
      return null;
    }
  };

  return {
    readAny,
    read: async <T,>(key: string, maxAgeMs: number) => {
      const entry = await readAny<T>(key);
      return entry && now() - entry.fetchedAt <= maxAgeMs ? entry : null;
    },
    write: async (key, entry) => {
      const file = fileFor(key);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry), 'utf8');
      await rename(tmp, file);
    },
  };
}
