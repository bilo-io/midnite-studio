import { app, nativeImage, net, protocol, utilityProcess } from 'electron';

import {
  createMapRuntime,
  mapCaptureWorkerScriptPath,
  mediaMapMain,
  geocodePlace,
  type CaptureWorkerHandle,
} from '@midnite/studio-feature-media-map/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createMapTools } from '../media/map/map-mcp';
import { setMapTools } from '../mcp/map-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { mediaStore, notifyMediaChanged } from './media-handlers';
import { terrainService } from './media-terrain-handlers';
import { readSecret } from './secrets-handlers';

/**
 * Media ▸ Maps (Phase 108): `map.json` per project plus the tile plumbing, composed here from the
 * `media-map` feature (Phase 113 Theme S). The feature owns the services and the six channels; this is
 * Studio's Electron-bound half of them — `net.fetch`, `nativeImage`, the capture `utilityProcess`, the
 * media store and the Terrain hand-off — which Gamer wires its own way.
 */
const runtime = createMapRuntime({
  readText: (req) => mediaStore.readFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, encoding: 'utf8' }),
  writeText: (req) =>
    mediaStore.writeFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, content: req.content, encoding: 'utf8' }),
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'map' }),
  get userData() {
    return app.getPath('userData');
  },
  fetch: (url, init) => net.fetch(url, init),
  get userAgent() {
    return `MidniteStudio/${app.getVersion()} (+https://github.com/bilo-io/midnite-apps)`;
  },
  readKey: () => readSecret('media.mapTilerApiKey'),
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
  spawnCaptureWorker: () => utilityProcess.fork(mapCaptureWorkerScriptPath(), [], { serviceName: 'mstudio-map-capture', stdio: 'ignore' }) as CaptureWorkerHandle,
  // Theme F: the hand-off calls the terrain service in main, not the renderer IPC chain.
  terrain: {
    library: (req) => terrainService().library(req),
    setInput: (req) => terrainService().setInput(req),
    setRoadsGraph: (target, graph) => terrainService().setRoadsGraph(target, graph),
    setBuildingsFootprints: (target, data) => terrainService().setBuildingsFootprints(target, data),
    setSpec: (req) => terrainService().setSpec(req),
    build: (req) => terrainService().build(req),
  },
  emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainOpen, event),
  onChanged: (repoId) => notifyMediaChanged(repoId, 'map'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMapCaptureProgress, event),
  log: (line) => defaultLogger.info(line),
});

export const mapService = runtime.map;
export const captureService = runtime.capture;

/** After `whenReady`: answers `mstudio-tile:` on the default session. */
export function installMapTileProtocol(): void {
  runtime.installProtocol((scheme, handler) => protocol.handle(scheme, (request) => handler(request)));
}

/** Ends the capture worker on quit, failing any capture still outstanding. */
export function disposeMapCaptureBroker(): void {
  runtime.dispose();
}

/**
 * The `map_*` MCP tools (Phase 108 Theme I): thin adapters over this file's own services, so
 * `map_capture_terrain` is the Maps tab's capture — satellite, roads and hand-off included. The write
 * tools sit behind the `allowMaps` switch (`mcp/map-tools.ts`); `map_goto` is broadcast to every window.
 */
setMapTools(
  createMapTools({
    resolveRepo: async (repoPath) => {
      const resolved = await resolveRegisteredRepo(repoPath);
      if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
      return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
    },
    listProjects: (repoId) => mediaStore.listProjects({ repoId, tab: 'map' }),
    listFiles: (scope) => mediaStore.listFiles(scope),
    readText: (req) => mediaStore.readFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, encoding: 'utf8' }),
    setView: (req) => mapService.setView(req),
    capture: (req) => captureService.capture(req),
    geocode: (query) => geocodePlace(query, (url, init) => net.fetch(url, init)),
    emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMapOpen, event),
  }),
);

export function registerMediaMapHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('maps never trash through this context')),
  };
  mediaMapMain.register(ctx, { runtime });
}
