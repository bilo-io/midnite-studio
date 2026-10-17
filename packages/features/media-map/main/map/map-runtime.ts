import { join } from 'node:path';

import {
  failure,
  ok,
  type GitOpResult,
  type MapCacheRequest,
  type MapCacheStatus,
  type MapCaptureProgressEvent,
  type MapSource,
  type MapSourceStatus,
  type TerrainOpenEvent,
} from '@midnite/studio-shared';

import { createCaptureBroker, type CaptureBroker, type CaptureWorkerHandle } from './capture-broker';
import { createCaptureService, type CaptureService, type CaptureTerrainPort } from './capture-service';
import { createOverpassClient, type OverpassDeps } from './overpass';
import { createMapService, createMapSettingsStore, type MapService } from './map-service';
import { createTileCache, type TileCache } from './tile-cache';
import { createTileFetcher, type TileFetcher } from './tile-fetch';
import { installTileProtocol, mapSourceStatuses, type TileProtocolHandle } from './tile-protocol';

/**
 * Everything the Maps feature's main half needs from the app that composes it (Phase 113 Theme S) — the
 * Electron-bound pieces (`net.fetch`, `nativeImage`, `utilityProcess`, `userData`) and the repo-scoped
 * media store. Nothing here is imported from `electron`: Studio's desktop and Gamer's main each hand in
 * their own, so the whole half runs under bare vitest.
 */
export type MapRuntimeDeps = {
  /** The media store's `map` tab: where a project's `map.json` and layers live. */
  readText: (req: { repoId: string; project: string; path: string }) => Promise<GitOpResult<string>>;
  writeText: (req: { repoId: string; project: string; path: string; content: string }) => Promise<GitOpResult<unknown>>;
  /** The absolute directory a repository's `map` tab lives under — captures are written here. */
  rootFor: (repoId: string) => Promise<string | null>;
  /** The app's userData: the tile cache (`map-tiles/`) and its settings sit under it. */
  userData: string;
  /** `net.fetch` in an app, a refusing stub in a test. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** `MidniteStudio/<version> (+…)` — sent to tile servers and Overpass, which both require one. */
  userAgent: string;
  /** The optional MapTiler key, read in main from the vault. Never sent to the renderer. */
  readKey: () => Promise<string | null>;
  /** Decodes JPEG/WebP to RGBA (`nativeImage` in an app) — null when it cannot. */
  nativeDecode: (bytes: Uint8Array) => Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
  /** Forks the capture worker (`utilityProcess.fork` in an app). Called lazily, once per capture. */
  spawnCaptureWorker: () => CaptureWorkerHandle;
  /** The Terrain feature's service, for the capture's hand-off. Absent → a capture cannot hand off. */
  terrain?: CaptureTerrainPort;
  /** Tells every window to select the terrain a capture just made. */
  emitOpen?: (event: TerrainOpenEvent) => void;
  onChanged: (repoId: string) => void;
  emitProgress: (event: MapCaptureProgressEvent) => void;
  log?: (line: string) => void;
};

export type MapRuntime = {
  map: MapService;
  capture: CaptureService;
  fetcher: TileFetcher;
  /** The tile cache, created on first use with the persisted cap. */
  tileCache(): Promise<TileCache>;
  /** Whether each tile source is usable — never carries a key. */
  sources(): Promise<MapSourceStatus[]>;
  /** The cache readout and its two writes (Settings ▸ Media ▸ Maps). */
  cache(req: MapCacheRequest): Promise<GitOpResult<MapCacheStatus>>;
  /** After `whenReady`: answers `mstudio-tile:` through the app's protocol handler. */
  installProtocol(handle: TileProtocolHandle): void;
  /** Ends the capture worker on quit, failing any capture still outstanding. */
  dispose(): void;
};

/** The one wiring of Maps' services, shared by Studio's desktop and Gamer — what `media-map-handlers.ts` was. */
export function createMapRuntime(deps: MapRuntimeDeps): MapRuntime {
  const log = deps.log ?? (() => undefined);
  const map = createMapService({
    readText: deps.readText,
    writeText: deps.writeText,
  });

  let cacheReady: Promise<TileCache> | null = null;
  const tileCache = (): Promise<TileCache> => {
    cacheReady ??= (async () => {
      const settings = await createMapSettingsStore(deps.userData).load();
      return createTileCache({ root: join(deps.userData, 'map-tiles'), capMB: settings.cacheCapMB });
    })();
    return cacheReady;
  };

  // The fetcher takes its cache lazily so creating it never touches disk.
  const lazyCache: TileCache = {
    get: async (key) => (await tileCache()).get(key),
    put: async (key, bytes) => (await tileCache()).put(key, bytes),
    status: async () => (await tileCache()).status(),
    clear: async () => (await tileCache()).clear(),
    setCap: async (capMB) => (await tileCache()).setCap(capMB),
  };
  /** The one tile fetcher — display (`mstudio-tile:`) and capture share it, so they share the cache and rate limits. */
  const fetcher = createTileFetcher({ fetch: deps.fetch, cache: lazyCache, userAgent: deps.userAgent, log });

  const broker: CaptureBroker = createCaptureBroker({ spawn: deps.spawnCaptureWorker });
  const capture = createCaptureService({
    rootFor: deps.rootFor,
    fetcher: { fetch: (key, url, opts) => fetcher.fetch(key, url, opts) },
    readKey: deps.readKey,
    nativeDecode: deps.nativeDecode,
    broker,
    // Theme E: the one Overpass request a capture makes, from main — never the renderer.
    overpass: createOverpassClient({
      fetch: deps.fetch as unknown as OverpassDeps['fetch'],
      userAgent: deps.userAgent,
      log,
    }),
    terrain: deps.terrain,
    emitOpen: deps.emitOpen,
    onChanged: deps.onChanged,
    emitProgress: deps.emitProgress,
    log,
  });

  return {
    map,
    capture,
    fetcher,
    tileCache,
    sources: () => mapSourceStatuses((_source: MapSource) => deps.readKey()),
    async cache(req) {
      try {
        const c = await tileCache();
        if (req.op === 'clear') await c.clear();
        if (req.op === 'set-cap') {
          await createMapSettingsStore(deps.userData).save({ version: 1, cacheCapMB: req.capMB });
          await c.setCap(req.capMB);
        }
        return ok(await c.status());
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    installProtocol(handle) {
      installTileProtocol({ fetcher, readKey: () => deps.readKey(), log }, handle);
    },
    dispose: () => broker.dispose(),
  };
}
