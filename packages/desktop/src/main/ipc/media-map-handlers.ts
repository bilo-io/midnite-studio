import { join } from 'node:path';

import { app, nativeImage, net, utilityProcess } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, ok, schemas, type GitOpResult, type MapCacheStatus } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createCaptureBroker, mapCaptureWorkerScriptPath, type CaptureWorkerHandle } from '../media/map/capture-broker';
import { createCaptureService } from '../media/map/capture-service';
import { createTileCache, type TileCache } from '../media/map/tile-cache';
import { createTileFetcher } from '../media/map/tile-fetch';
import { createMapService, createMapSettingsStore } from '../media/map/map-service';
import { installTileProtocol, mapSourceStatuses } from '../media/map/tile-protocol';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare } from './handle';
import { mediaStore, notifyMediaChanged } from './media-handlers';
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

let sharedFetcher: ReturnType<typeof createTileFetcher> | null = null;

/** The one tile fetcher — display (`mstudio-tile:`) and capture share it, so they share the cache and the rate limits. */
function tileFetcher(): ReturnType<typeof createTileFetcher> {
  if (sharedFetcher) return sharedFetcher;
  const userAgent = `MidniteStudio/${app.getVersion()} (+https://github.com/bilo-io/midnite-apps)`;
  // The fetcher takes its cache lazily so creating it never touches disk.
  const lazyCache: TileCache = {
    get: async (key) => (await tileCache()).get(key),
    put: async (key, bytes) => (await tileCache()).put(key, bytes),
    status: async () => (await tileCache()).status(),
    clear: async () => (await tileCache()).clear(),
    setCap: async (capMB) => (await tileCache()).setCap(capMB),
  };
  sharedFetcher = createTileFetcher({
    fetch: (url, init) => net.fetch(url, init),
    cache: lazyCache,
    userAgent,
    log: (line) => defaultLogger.info(line),
  });
  return sharedFetcher;
}

/** After `whenReady`: answers `mstudio-tile:` on the default session. */
export function installMapTileProtocol(): void {
  installTileProtocol({ fetcher: tileFetcher(), readKey: () => readKey(), log: (line) => defaultLogger.info(line) });
}

const captureBroker = createCaptureBroker({
  spawn: () => utilityProcess.fork(mapCaptureWorkerScriptPath(), [], { serviceName: 'mstudio-map-capture', stdio: 'ignore' }) as CaptureWorkerHandle,
});

/** Ends the capture worker on quit, failing any capture still outstanding. */
export function disposeMapCaptureBroker(): void {
  captureBroker.dispose();
}

export const captureService = createCaptureService({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'map' }),
  fetcher: { fetch: (key, url, opts) => tileFetcher().fetch(key, url, opts) },
  readKey: () => readKey(),
  // JPEG and WebP: `nativeImage` yields BGRA, which the worker's DEM decode wants as RGBA.
  nativeDecode: async (bytes) => {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const bgra = image.toBitmap();
    const rgba = new Uint8Array(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) {
      rgba[i] = bgra[i + 2]!;
      rgba[i + 1] = bgra[i + 1]!;
      rgba[i + 2] = bgra[i]!;
      rgba[i + 3] = bgra[i + 3]!;
    }
    return { width, height, rgba };
  },
  broker: captureBroker,
  onChanged: (repoId) => notifyMediaChanged(repoId, 'map'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMapCaptureProgress, event),
  log: (line) => defaultLogger.info(line),
});

export function registerMediaMapHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaMapGet, schemas.MediaMapGetRequest, (req) => mapService.get(req), invalid);
  handle(CHANNELS.mediaMapSetView, schemas.MediaMapSetViewRequest, (req) => mapService.setView(req), invalid);
  handle(CHANNELS.mediaMapCapture, schemas.MediaMapCaptureRequest, (req) => captureService.capture(req), invalid);
  handle(
    CHANNELS.mediaMapCaptureCancel,
    schemas.MediaMapCaptureCancelRequest,
    (req) => ok({ cancelled: captureService.cancel(req.captureId) }),
    invalid,
  );
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
