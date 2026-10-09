import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

/**
 * The map tile cache (Phase 108 Theme B): one file per tile under `userData/map-tiles/`, at
 * `<source>/<z>/<x>/<y>.<ext>` (glyphs, sprites and TileJSON sit beside them under their own paths).
 *
 * LRU on disk. The index (path → size, last used) is built lazily by one directory walk the first time
 * the cache is touched; a hit refreshes the file's mtime so the order survives a restart. A write that
 * takes the total over the cap evicts least-recently-used files until the total is at most 90 % of
 * the cap — so eviction runs in batches, not on every write once the cache is full.
 *
 * The cache is not repo data and is safe to delete at any time; nothing here throws to a caller.
 */
export type TileCache = {
  get: (key: string) => Promise<Uint8Array | null>;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  status: () => Promise<{ bytes: number; tiles: number; capMB: number }>;
  clear: () => Promise<void>;
  setCap: (capMB: number) => Promise<void>;
};

export type TileCacheDeps = {
  root: string;
  capMB: number;
  now?: () => number;
};

const EVICT_TO = 0.9;
const MB = 1024 * 1024;

/** A cache key is a relative path of plain segments; anything else is refused. */
export function safeCacheKey(key: string): boolean {
  if (!key || key.startsWith('/') || key.includes('\0') || key.includes('\\')) return false;
  return key.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function createTileCache(deps: TileCacheDeps): TileCache {
  const now = deps.now ?? Date.now;
  let capBytes = deps.capMB * MB;
  let index: Map<string, { size: number; lastUsed: number }> | null = null;
  let total = 0;
  let loading: Promise<void> | null = null;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        try {
          const info = await stat(full);
          const key = relative(deps.root, full).split(sep).join('/');
          index!.set(key, { size: info.size, lastUsed: info.mtimeMs });
          total += info.size;
        } catch {
          // Vanished mid-walk.
        }
      }
    }
  }

  async function ensureIndex(): Promise<Map<string, { size: number; lastUsed: number }>> {
    if (index) return index;
    if (!loading) {
      loading = (async () => {
        index = new Map();
        total = 0;
        await walk(deps.root);
      })();
    }
    await loading;
    return index!;
  }

  async function evict(): Promise<void> {
    const entries = await ensureIndex();
    if (total <= capBytes) return;
    const target = capBytes * EVICT_TO;
    const oldest = [...entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of oldest) {
      if (total <= target) break;
      await rm(join(deps.root, key), { force: true }).catch(() => undefined);
      entries.delete(key);
      total -= entry.size;
    }
  }

  return {
    async get(key) {
      if (!safeCacheKey(key)) return null;
      const entries = await ensureIndex();
      const entry = entries.get(key);
      if (!entry) return null;
      const path = join(deps.root, key);
      try {
        const bytes = await readFile(path);
        entry.lastUsed = now();
        const at = new Date(entry.lastUsed);
        await utimes(path, at, at).catch(() => undefined);
        return new Uint8Array(bytes);
      } catch {
        entries.delete(key);
        total -= entry.size;
        return null;
      }
    },

    async put(key, bytes) {
      if (!safeCacheKey(key)) return;
      const entries = await ensureIndex();
      const path = join(deps.root, key);
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
      } catch {
        return;
      }
      const previous = entries.get(key);
      if (previous) total -= previous.size;
      entries.set(key, { size: bytes.byteLength, lastUsed: now() });
      total += bytes.byteLength;
      await evict();
    },

    async status() {
      const entries = await ensureIndex();
      return { bytes: total, tiles: entries.size, capMB: Math.round(capBytes / MB) };
    },

    async clear() {
      await ensureIndex();
      await rm(deps.root, { recursive: true, force: true }).catch(() => undefined);
      index = new Map();
      total = 0;
    },

    async setCap(capMB) {
      capBytes = capMB * MB;
      await evict();
    },
  };
}
