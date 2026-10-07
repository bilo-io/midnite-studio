import { protocol } from 'electron';

import {
  expandMapTemplate,
  MAP_KEY_MISSING_REASON,
  MAP_SOURCE_CONTENT_TYPE,
  MAP_SOURCE_EXT,
  MAP_SOURCES,
  mapSource,
  mapTileUrl,
  MapSourceIdSchema,
  MSTUDIO_TILE_SCHEME,
  rewriteStyleUrls,
  type MapSource,
  type MapSourceStatus,
} from '@midnite/studio-shared';

import type { TileFetcher, TileResult } from './tile-fetch';

/**
 * `mstudio-tile://<source>/…` — how every map byte reaches the renderer (Phase 108 Theme B, Decision 10).
 *
 * Routes, per catalogue source:
 *
 *   /<z>/<x>/<y>                      a tile
 *   /tilejson                         the source's TileJSON, `tiles` rewritten to this scheme
 *   /style/<name>                     an upstream style, every URL rewritten to this scheme
 *   /fonts/<stack>/<range>.pbf        glyphs
 *   /sprite[@2x].<json|png>           the sprite sheet
 *
 * Anything else, or an unknown source, is a 404. A keyed source with no key is a 403 with an empty
 * body. The key is expanded into the upstream URL here, in main, and never leaves: not in a response,
 * not in a header, not in a log line (which names the source and the route path only).
 *
 * Registered on the **default session only** (`installTileProtocol`), like `mstudio-file:` — the
 * browser partition and game sessions can never resolve it.
 */
export type TileHandlerDeps = {
  fetcher: TileFetcher;
  /** The MapTiler key, or null. Read on every request, so a key set in Settings applies at once. */
  readKey: (source: MapSource) => Promise<string | null>;
  log?: (line: string) => void;
};

const CACHE_CONTROL = 'max-age=86400';

function respond(bytes: Uint8Array | string, contentType: string): Response {
  const body = typeof bytes === 'string' ? bytes : new Uint8Array(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
      // The renderer's blob worker fetches from the app's own origin; this scheme is a different one.
      'Access-Control-Allow-Origin': '*',
    },
  });
}

const empty = (status: number): Response =>
  new Response(null, { status, headers: { 'Access-Control-Allow-Origin': '*' } });

function failureResponse(result: Extract<TileResult, { ok: false }>): Response {
  if (typeof result.status === 'number') return empty(result.status >= 400 && result.status < 600 ? result.status : 502);
  return empty(result.status === 'aborted' ? 499 : 503);
}

const TILE = /^\/(\d{1,2})\/(\d{1,8})\/(\d{1,8})$/;
const FONT = /^\/fonts\/([^/]+)\/(\d{1,6}-\d{1,6})\.pbf$/;
const SPRITE = /^\/sprite(@2x)?\.(json|png)$/;
const STYLE = /^\/style\/([a-z0-9-]+)$/;

export function createTileHandler(deps: TileHandlerDeps) {
  /** Tile templates learned from a source's TileJSON (OpenFreeMap's planet path is versioned). */
  const learned = new Map<string, string>();

  const log = (source: string, path: string, outcome: string) => deps.log?.(`[map-tile] ${source} ${path} ${outcome}`);

  async function tileJson(source: MapSource, key: string | null, signal?: AbortSignal): Promise<Record<string, unknown> | TileResult> {
    const url = expandMapTemplate(source.tileJsonUrl!, { key });
    const result = await deps.fetcher.fetch(`${source.id}/tilejson.json`, url, { cache: !source.requiresKey, ...(signal ? { signal } : {}) });
    if (!result.ok) return result;
    try {
      const json = JSON.parse(new TextDecoder().decode(result.bytes)) as Record<string, unknown>;
      const tiles = json['tiles'];
      if (Array.isArray(tiles) && typeof tiles[0] === 'string') learned.set(source.id, tiles[0]);
      return json;
    } catch {
      return { ok: false, status: 502, message: 'Malformed TileJSON.' };
    }
  }

  return async function handle(rawUrl: string, signal?: AbortSignal): Promise<Response> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return empty(404);
    }
    const id = MapSourceIdSchema.safeParse(url.host);
    if (url.protocol !== `${MSTUDIO_TILE_SCHEME}:` || !id.success) return empty(404);
    const source = mapSource(id.data);
    const path = decodeURIComponent(url.pathname);
    const key = source.requiresKey ? await deps.readKey(source) : null;
    if (source.requiresKey && !key) {
      log(source.id, path, '403 (no key)');
      return empty(403);
    }
    const opts = signal ? { signal } : {};

    const finish = (result: TileResult, contentType: string): Response => {
      if (result.ok) return respond(result.bytes, contentType);
      log(source.id, path, String(result.status));
      return failureResponse(result);
    };

    const tile = TILE.exec(path);
    if (tile) {
      const [z, x, y] = [Number(tile[1]), Number(tile[2]), Number(tile[3])];
      const span = 2 ** z;
      if (z < source.minZoom || z > source.maxZoom || x >= span || y >= span) return empty(404);
      let template = source.template ?? learned.get(source.id);
      if (!template && source.tileJsonUrl) {
        const json = await tileJson(source, key, signal);
        if ('ok' in json && json.ok === false) return finish(json, '');
        template = learned.get(source.id);
      }
      if (!template) return empty(404);
      const upstream = expandMapTemplate(template, { z, x, y, key });
      return finish(
        await deps.fetcher.fetch(`${source.id}/${z}/${x}/${y}.${MAP_SOURCE_EXT[source.encoding]}`, upstream, opts),
        MAP_SOURCE_CONTENT_TYPE[source.encoding],
      );
    }

    if (path === '/tilejson') {
      if (!source.tileJsonUrl) return empty(404);
      const json = await tileJson(source, key, signal);
      if ('ok' in json && json.ok === false) return finish(json, '');
      const out: Record<string, unknown> = { ...json, tiles: [mapTileUrl(source.id)] };
      delete out['grids'];
      delete out['data'];
      return respond(JSON.stringify(out), 'application/json');
    }

    const style = STYLE.exec(path);
    if (style) {
      const upstream = source.styles?.[style[1]!];
      if (!upstream) return empty(404);
      const result = await deps.fetcher.fetch(`${source.id}/style/${style[1]}.json`, expandMapTemplate(upstream, { key }), {
        ...opts,
        cache: !source.requiresKey,
      });
      if (!result.ok) return finish(result, '');
      try {
        const parsed = JSON.parse(new TextDecoder().decode(result.bytes)) as Record<string, unknown>;
        return respond(JSON.stringify(rewriteStyleUrls(parsed, source.id)), 'application/json');
      } catch {
        log(source.id, path, 'malformed style');
        return empty(502);
      }
    }

    const font = FONT.exec(path);
    if (font) {
      if (!source.glyphs) return empty(404);
      const [stack, range] = [font[1]!, font[2]!];
      const upstream = source.glyphs
        .replace('{fontstack}', encodeURIComponent(stack))
        .replace('{range}', range)
        .replace('{key}', encodeURIComponent(key ?? ''));
      return finish(await deps.fetcher.fetch(`${source.id}/fonts/${stack}/${range}.pbf`, upstream, opts), 'application/x-protobuf');
    }

    const sprite = SPRITE.exec(path);
    if (sprite) {
      if (!source.sprite) return empty(404);
      const suffix = `${sprite[1] ?? ''}.${sprite[2]}`;
      return finish(
        await deps.fetcher.fetch(`${source.id}/sprite${suffix}`, `${source.sprite}${suffix}`, opts),
        sprite[2] === 'json' ? 'application/json' : 'image/png',
      );
    }

    return empty(404);
  };
}

/** What `mstudio:media:map-sources` answers: whether each source is usable, never a key. */
export async function mapSourceStatuses(readKey: (source: MapSource) => Promise<string | null>): Promise<MapSourceStatus[]> {
  return Promise.all(
    MAP_SOURCES.map(async (source): Promise<MapSourceStatus> => {
      if (!source.requiresKey) return { id: source.id, available: true };
      return (await readKey(source)) ? { id: source.id, available: true } : { id: source.id, available: false, reason: MAP_KEY_MISSING_REASON };
    }),
  );
}

/** After `whenReady`: answers `mstudio-tile:` on the default session (never a partition). */
export function installTileProtocol(deps: TileHandlerDeps): void {
  const handle = createTileHandler(deps);
  protocol.handle(MSTUDIO_TILE_SCHEME, (request) => handle(request.url, request.signal));
}
