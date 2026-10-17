import type { TileCache } from './tile-cache';

/**
 * The main-side tile fetcher (Phase 108 Theme B). Every upstream request the Maps tab makes — tiles,
 * glyphs, sprites, styles, TileJSON — goes through here, so one place owns the politeness rules:
 *
 * - at most {@link MAX_PER_HOST} requests in flight per host;
 * - 429 / 502 / 503 / 504 retried {@link RETRIES}× at 500 ms · 2ⁿ with ±20 % jitter, honouring
 *   `Retry-After`;
 * - a 404 is not retried, and is remembered for 24 h (ocean tiles at deep zoom 404 on some sources);
 * - a fixed `User-Agent`, per the providers' usage policies;
 * - duplicate concurrent requests for one key share one upstream fetch.
 *
 * It never throws: the answer is a {@link TileResult}. Messages never carry the upstream URL, which may
 * hold `?key=` — callers log the source id and the key, not where the bytes came from.
 */
export type TileResult =
  | { ok: true; bytes: Uint8Array; fromCache: boolean; contentType?: string }
  | { ok: false; status: number | 'network' | 'aborted'; message: string };

export type TileFetcherDeps = {
  fetch: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
  cache: TileCache | null;
  userAgent: string;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  log?: (line: string) => void;
};

export type TileFetcher = {
  /**
   * `key` is the cache path (`<source>/<z>/<x>/<y>.<ext>`, `<source>/fonts/…`); `url` is the expanded
   * upstream URL. `cache: false` skips the disk cache (a TileJSON whose tile URLs carry a key).
   */
  fetch: (key: string, url: string, opts?: { signal?: AbortSignal; cache?: boolean }) => Promise<TileResult>;
};

export const MAX_PER_HOST = 6;
export const RETRIES = 3;
export const RETRY_BASE_MS = 500;
const RETRYABLE = new Set([429, 502, 503, 504]);
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

const aborted = (): TileResult => ({ ok: false, status: 'aborted', message: 'Request aborted.' });

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** `Retry-After` in seconds or as an HTTP date → milliseconds, or null. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** A tiny per-host semaphore. */
function createLimiter(max: number) {
  const active = new Map<string, number>();
  const waiting = new Map<string, Array<() => void>>();
  return {
    async acquire(host: string): Promise<() => void> {
      if ((active.get(host) ?? 0) >= max) {
        await new Promise<void>((resolve) => {
          const queue = waiting.get(host) ?? [];
          queue.push(resolve);
          waiting.set(host, queue);
        });
      }
      active.set(host, (active.get(host) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active.set(host, (active.get(host) ?? 1) - 1);
        const next = waiting.get(host)?.shift();
        next?.();
      };
    },
  };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

export function createTileFetcher(deps: TileFetcherDeps): TileFetcher {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const limiter = createLimiter(MAX_PER_HOST);
  const inflight = new Map<string, Promise<TileResult>>();
  const notFound = new Map<string, number>();

  async function upstream(key: string, url: string, useCache: boolean): Promise<TileResult> {
    const host = hostOf(url);
    for (let attempt = 0; ; attempt++) {
      const release = await limiter.acquire(host);
      let response: Response;
      try {
        response = await deps.fetch(url, { headers: { 'User-Agent': deps.userAgent } });
      } catch {
        release();
        return { ok: false, status: 'network', message: 'Network error.' };
      }
      if (response.ok) {
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await response.arrayBuffer());
        } catch {
          release();
          return { ok: false, status: 'network', message: 'Network error while reading the response.' };
        }
        release();
        if (useCache) await deps.cache?.put(key, bytes);
        const contentType = response.headers.get('content-type') ?? undefined;
        return { ok: true, bytes, fromCache: false, ...(contentType ? { contentType } : {}) };
      }
      release();
      if (response.status === 404) {
        notFound.set(key, now() + NEGATIVE_TTL_MS);
        return { ok: false, status: 404, message: 'Not found.' };
      }
      if (!RETRYABLE.has(response.status) || attempt >= RETRIES) {
        return { ok: false, status: response.status, message: `HTTP ${response.status}.` };
      }
      const backoff = RETRY_BASE_MS * 2 ** attempt * (0.8 + 0.4 * random());
      const wait = retryAfterMs(response.headers.get('retry-after'), now()) ?? backoff;
      deps.log?.(`[map-tile] ${key} HTTP ${response.status}, retry ${attempt + 1} in ${Math.round(wait)} ms`);
      await sleep(wait);
    }
  }

  return {
    async fetch(key, url, opts = {}) {
      const signal = opts.signal;
      const useCache = opts.cache !== false;
      if (signal?.aborted) return aborted();
      const negative = notFound.get(key);
      if (negative !== undefined) {
        if (negative > now()) return { ok: false, status: 404, message: 'Not found.' };
        notFound.delete(key);
      }
      if (useCache) {
        const cached = await deps.cache?.get(key);
        if (cached) return { ok: true, bytes: cached, fromCache: true };
      }
      let shared = inflight.get(key);
      if (!shared) {
        shared = upstream(key, url, useCache).finally(() => inflight.delete(key));
        inflight.set(key, shared);
      }
      if (!signal) return shared;
      // A caller that aborts stops waiting; the shared fetch still lands in the cache for the next one.
      return new Promise<TileResult>((resolve) => {
        const onAbort = () => resolve(aborted());
        signal.addEventListener('abort', onAbort, { once: true });
        void shared!.then((result) => {
          signal.removeEventListener('abort', onAbort);
          resolve(result);
        });
      });
    },
  };
}
