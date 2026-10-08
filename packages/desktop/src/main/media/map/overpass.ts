import { MAP_ROADS_BUSY, map } from '@midnite/studio-shared';

/**
 * The one Overpass request a capture makes (Phase 108 Theme E, Decision 2): road ways for the frame's
 * bbox, with their nodes, in one POST. It runs in main — the renderer's CSP never grows an OSM host —
 * through an injected `fetch`, so tests fake it and never touch the network. 90 s client timeout,
 * response capped at 64 MB, 429/504 retried once after `Retry-After` (10 s by default).
 */
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_TIMEOUT_MS = 90_000;
export const OVERPASS_MAX_BYTES = 64 * 1024 * 1024;
export const OVERPASS_DEFAULT_RETRY_S = 10;

/** `bbox` is `[west, south, east, north]`; Overpass wants `(S,W,N,E)`. */
export function overpassQuery(bbox: readonly [number, number, number, number]): string {
  const [w, s, e, n] = bbox;
  const box = [s, w, n, e].map((v) => v.toFixed(7)).join(',');
  return `[out:json][timeout:60];way["highway"~"${map.OSM_HIGHWAY_FILTER}"](${box});(._;>;);out body;`;
}

export type OverpassResponseLike = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type OverpassResult =
  | { ok: true; osm: map.OsmResponse }
  | { ok: false; reason: string; aborted?: true };

export type OverpassDeps = {
  fetch: (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<OverpassResponseLike>;
  userAgent: string;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

export function createOverpassClient(deps: OverpassDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => undefined);

  async function once(body: string, signal: AbortSignal): Promise<{ res: OverpassResponseLike } | { error: string }> {
    try {
      const res = await deps.fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'User-Agent': deps.userAgent, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(OVERPASS_TIMEOUT_MS)]),
      });
      return { res };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function query(bbox: readonly [number, number, number, number], signal: AbortSignal): Promise<OverpassResult> {
    const body = `data=${encodeURIComponent(overpassQuery(bbox))}`;
    let attempt = await once(body, signal);
    for (let retried = false; ; retried = true) {
      if (signal.aborted) return { ok: false, reason: 'Capture cancelled.', aborted: true };
      if ('error' in attempt) return { ok: false, reason: "Could not reach OpenStreetMap's Overpass server." };
      const { res } = attempt;
      if ((res.status === 429 || res.status === 504) && !retried) {
        const header = Number(res.headers.get('retry-after'));
        const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, 60) : OVERPASS_DEFAULT_RETRY_S;
        log(`overpass ${res.status}: retrying in ${seconds}s`);
        await sleep(seconds * 1000);
        attempt = await once(body, signal);
        continue;
      }
      if (res.status === 429 || res.status === 504 || res.status >= 500) return { ok: false, reason: MAP_ROADS_BUSY };
      if (!res.ok) return { ok: false, reason: `OpenStreetMap's Overpass server answered HTTP ${res.status}.` };
      const declared = Number(res.headers.get('content-length'));
      if (declared > OVERPASS_MAX_BYTES) return { ok: false, reason: 'The roads response was too large (over 64 MB).' };
      try {
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > OVERPASS_MAX_BYTES) return { ok: false, reason: 'The roads response was too large (over 64 MB).' };
        return { ok: true, osm: JSON.parse(new TextDecoder().decode(bytes)) as map.OsmResponse };
      } catch {
        if (signal.aborted) return { ok: false, reason: 'Capture cancelled.', aborted: true };
        return { ok: false, reason: 'OpenStreetMap returned a response that could not be read.' };
      }
    }
  }

  return { query };
}

export type OverpassClient = ReturnType<typeof createOverpassClient>;
