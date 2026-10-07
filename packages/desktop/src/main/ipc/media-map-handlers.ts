import { join } from 'node:path';

import { app, net } from 'electron';

import { CHANNELS, failure, ok, schemas, type GitOpResult, type MapCacheStatus } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createTileCache, type TileCache } from '../media/map/tile-cache';
import { createTileFetcher } from '../media/map/tile-fetch';
import { createMapService, createMapSettingsStore } from '../media/map/map-service';
import { installTileProtocol, mapSourceStatuses } from '../media/map/tile-protocol';
import { handle, handleBare } from './handle';
import { mediaStore } from './media-handlers';
import { readSecret } from './secrets-handlers';

/**
 * Media ▸ Maps (Phase 108): `map.json` per project plus the tile plumbing. The Electron-bound shell
 * around `main/media/map/` — the service, cache and fetcher are plain Node and tested without it.
 */
export const mapService = createMapService({
  readText: (req) => mediaStore.readFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, encoding: 'utf8' }),
  writeText: (req) =>
    mediaStore.writeFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, content: req.content, encoding: 'utf8' }),
});

const readKey = () => readSecret('media.mapTilerApiKey');

let cache: TileCache | null = null;
let cacheReady: Promise<TileCache> | null = null;

/** The cache, created on first use with the persisted cap. */
function tileCache(): Promise<TileCache> {
  cacheReady ??= (async () => {
    const userData = app.getPath('userData');
    const settings = await createMapSettingsStore(userData).load();
    cache = createTileCache({ root: join(userData, 'map-tiles'), capMB: settings.cacheCapMB });
    return cache;
  })();
  return cacheReady;
}

/** After `whenReady`: answers `mstudio-tile:` on the default session. */
export function installMapTileProtocol(): void {
  const userAgent = `MidniteStudio/${app.getVersion()} (+https://github.com/bilo-io/midnite-apps)`;
  // The fetcher takes its cache lazily so installing the protocol never touches disk.
  const lazyCache: TileCache = {
    get: async (key) => (await tileCache()).get(key),
    put: async (key, bytes) => (await tileCache()).put(key, bytes),
    status: async () => (await tileCache()).status(),
    clear: async () => (await tileCache()).clear(),
    setCap: async (capMB) => (await tileCache()).setCap(capMB),
  };
  const fetcher = createTileFetcher({
    fetch: (url, init) => net.fetch(url, init),
    cache: lazyCache,
    userAgent,
    log: (line) => defaultLogger.info(line),
  });
  installTileProtocol({ fetcher, readKey: () => readKey(), log: (line) => defaultLogger.info(line) });
}

export function registerMediaMapHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaMapGet, schemas.MediaMapGetRequest, (req) => mapService.get(req), invalid);
  handle(CHANNELS.mediaMapSetView, schemas.MediaMapSetViewRequest, (req) => mapService.setView(req), invalid);
  handleBare(CHANNELS.mediaMapSources, async () => ({ sources: await mapSourceStatuses(() => readKey()) }));
  handle(
    CHANNELS.mediaMapCache,
    schemas.MediaMapCacheRequest,
    async (req): Promise<GitOpResult<MapCacheStatus>> => {
      try {
        const c = await tileCache();
        if (req.op === 'clear') await c.clear();
        if (req.op === 'set-cap') {
          await createMapSettingsStore(app.getPath('userData')).save({ version: 1, cacheCapMB: req.capMB });
          await c.setCap(req.capMB);
        }
        return ok(await c.status());
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    invalid,
  );
}
