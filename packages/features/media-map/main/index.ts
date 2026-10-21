import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { mediaMapManifest } from '../manifest';
import type { MapRuntime } from './map/map-runtime';

export { mediaMapManifest, type MediaMapManifest } from '../manifest';
export { createMapRuntime, type MapRuntime, type MapRuntimeDeps } from './map/map-runtime';
export { createMapService, createMapSettingsStore, type MapService, type MapServiceDeps } from './map/map-service';
export { createCaptureService, DEFAULT_DEM_SOURCE, type CaptureService, type CaptureTerrainPort } from './map/capture-service';
export { createCaptureBroker, mapCaptureWorkerScriptPath, type CaptureBroker, type CaptureWorkerHandle } from './map/capture-broker';
export { createCaptureDispatcher } from './map/capture-dispatch';
export type { CaptureWorkerIn, CaptureWorkerOut } from './map/capture-protocol';
export { geocodePlace } from './map/geocode';
export { createOverpassClient, type OverpassClient, type OverpassDeps } from './map/overpass';
export { createTileCache, type TileCache } from './map/tile-cache';
export { createTileFetcher, type TileFetcher } from './map/tile-fetch';
export { createTileHandler, installTileProtocol, mapSourceStatuses, type TileProtocolHandle } from './map/tile-protocol';

/**
 * The Maps feature's main half (Phase 113 Theme S): `map.json` per project, the tile sources and cache,
 * and the capture that hands a heightmap, satellite image and roads to a new Terrain. `map-runtime.ts`
 * wires the services; this file only registers their six channels.
 *
 * The composer builds a {@link MapRuntime} with its own `net.fetch`, decoder, worker spawn and userData
 * and registers with it. Nothing here imports `electron`.
 */
export type MediaMapMainServices = { runtime: MapRuntime };

export const mediaMapMain = defineFeatureMain<MediaMapMainServices>({
  feature: mediaMapManifest.feature,
  channels: mediaMapManifest.ipc,
  register(ctx, { runtime }) {
    const { handle, handleBare } = ctx.ipc;
    const invalid = (issue: string) => failure(issue);
    handle(CHANNELS.mediaMapGet, schemas.MediaMapGetRequest, (req) => runtime.map.get(req), invalid);
    handle(CHANNELS.mediaMapSetView, schemas.MediaMapSetViewRequest, (req) => runtime.map.setView(req), invalid);
    handle(CHANNELS.mediaMapCapture, schemas.MediaMapCaptureRequest, (req) => runtime.capture.capture(req), invalid);
    handle(
      CHANNELS.mediaMapCaptureCancel,
      schemas.MediaMapCaptureCancelRequest,
      (req) => ok({ cancelled: runtime.capture.cancel(req.captureId) }),
      invalid,
    );
    handleBare(CHANNELS.mediaMapSources, async () => ({ sources: await runtime.sources() }));
    handle(CHANNELS.mediaMapCache, schemas.MediaMapCacheRequest, (req) => runtime.cache(req), invalid);
  },
});
