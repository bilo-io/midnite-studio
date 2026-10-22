import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range';
export const BREACH_CACHE_FILE = 'vault-breach-cache.json';
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type BreachCheckResult = {
  breached: boolean;
  count: number;
  checkedAt: number;
  fromCache?: boolean;
};

type StoredBreachCache = {
  version: 1;
  salt: string;
  entries: Record<string, { breached: boolean; count: number; checkedAt: number }>;
};

export type FetchFn = typeof fetch;

export function hashSha1Upper(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex').toUpperCase();
}

export function hashWithSalt(salt: string, text: string): string {
  return createHash('sha256').update(`${salt}:${text}`, 'utf8').digest('hex');
}

export type BreachChecker = {
  check(password: string, options?: { skipCache?: boolean }): Promise<BreachCheckResult>;
  clearCache(): Promise<void>;
};

export function createBreachChecker(directory: string, customFetch: FetchFn = fetch): BreachChecker {
  const cachePath = join(directory, BREACH_CACHE_FILE);
  let cache: StoredBreachCache | null = null;

  const loadCache = async (): Promise<StoredBreachCache> => {
    if (cache) return cache;
    try {
      const raw = await readFile(cachePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && typeof parsed.salt === 'string' && typeof parsed.entries === 'object') {
        cache = parsed;
        return cache!;
      }
    } catch {
      // Missing or corrupt cache file
    }
    cache = {
      version: 1,
      salt: randomBytes(16).toString('hex'),
      entries: {},
    };
    return cache;
  };

  const saveCache = async (c: StoredBreachCache): Promise<void> => {
    cache = c;
    try {
      await writeFile(cachePath, JSON.stringify(c, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Ignore write errors
    }
  };

  const check = async (password: string, options?: { skipCache?: boolean }): Promise<BreachCheckResult> => {
    const c = await loadCache();
    const cacheKey = hashWithSalt(c.salt, password);
    const now = Date.now();

    if (!options?.skipCache) {
      const cached = c.entries[cacheKey];
      if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
        return {
          breached: cached.breached,
          count: cached.count,
          checkedAt: cached.checkedAt,
          fromCache: true,
        };
      }
    }

    const sha1 = hashSha1Upper(password);
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const url = `${HIBP_API_BASE}/${prefix}`;
    const res = await customFetch(url, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'Midnite-Studio-Vault',
      },
    });

    if (!res.ok) {
      throw new Error(`HIBP API returned HTTP ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split('\r\n').flatMap((l) => l.split('\n'));
    let breached = false;
    let count = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [lineSuffix, countStr] = trimmed.split(':');
      if (!lineSuffix || !countStr) continue;
      const rowCount = parseInt(countStr, 10);
      if (isNaN(rowCount) || rowCount <= 0) continue; // Skip padding rows (count 0)
      if (lineSuffix.toUpperCase() === suffix) {
        breached = true;
        count = rowCount;
        break;
      }
    }

    const result: BreachCheckResult = {
      breached,
      count,
      checkedAt: now,
    };

    c.entries[cacheKey] = result;
    await saveCache(c);

    return result;
  };

  const clearCache = async (): Promise<void> => {
    cache = {
      version: 1,
      salt: randomBytes(16).toString('hex'),
      entries: {},
    };
    await saveCache(cache);
  };

  return {
    check,
    clearCache,
  };
}
