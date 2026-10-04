import { nativeImage, shell, utilityProcess } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createTerrainBroker, terrainWorkerScriptPath, type TerrainWorkerHandle } from '../media/terrain/terrain-broker';
import { createTerrainService, notAvailableYet } from '../media/terrain/terrain-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle } from './handle';
import { mediaStore, notifyMediaChanged } from './media-handlers';

/**
 * Media ▸ Terrain (Phase 105): a heightfield from up to three optional images. The build runs in
 * `terrain-worker`, a utility process, so a 4097² terrain never blocks a frame; everything here is
 * the thin Electron-bound shell around `main/media/terrain/terrain-service.ts`.
 *
 * `paint` (Theme F), `roadKey` (Theme H) and `export` (Theme I) are registered now and answer
 * "not available yet" — a half landing must never hang the renderer on an unregistered channel.
 */
const broker = createTerrainBroker({
  spawn: () => utilityProcess.fork(terrainWorkerScriptPath(), [], { serviceName: 'mstudio-terrain', stdio: 'ignore' }) as TerrainWorkerHandle,
});

/** Ends the worker on quit, failing any build still outstanding. */
export function disposeTerrainBroker(): void {
  broker.dispose();
}

const service = createTerrainService({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'terrain' }),
  writeBytes: (req) => mediaStore.writeBytes({ repoId: req.repoId, tab: 'terrain', project: req.project, path: req.path, data: req.data }),
  trash: (absPath) => shell.trashItem(absPath),
  // JPEG and WebP are decoded here once, at attach (8-bit anyway), and kept as PNG; so is an 8-bit
  // image above the side cap, downscaled. The worker therefore only ever reads PNG.
  toPng: async (bytes, { maxSide }) => {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const side = Math.max(width, height);
    if (side <= maxSide) return { png: image.toPNG() };
    const scale = maxSide / side;
    const resized = image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' });
    return { png: resized.toPNG(), downscaledFrom: { width, height } };
  },
  broker,
  onChanged: (repoId) => notifyMediaChanged(repoId, 'terrain'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainProgress, event),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainChanged, event),
  log: (line) => defaultLogger.info(line),
});

export function registerMediaTerrainHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaTerrainLibrary, schemas.MediaTerrainLibraryRequest, (req) => service.library(req), invalid);
  handle(CHANNELS.mediaTerrainGet, schemas.MediaTerrainGetRequest, (req) => service.get(req), invalid);
  handle(CHANNELS.mediaTerrainSetSpec, schemas.MediaTerrainSetSpecRequest, (req) => service.setSpec(req), invalid);
  handle(CHANNELS.mediaTerrainSetInput, schemas.MediaTerrainSetInputRequest, (req) => service.setInput(req), invalid);
  handle(CHANNELS.mediaTerrainBuild, schemas.MediaTerrainBuildRequest, (req) => service.build(req), invalid);
  handle(CHANNELS.mediaTerrainCancel, schemas.MediaTerrainCancelRequest, ({ buildId }) => service.cancel(buildId), invalid);
  handle(CHANNELS.mediaTerrainPaint, schemas.MediaTerrainPaintRequest, () => notAvailableYet(), invalid);
  handle(CHANNELS.mediaTerrainRoadKey, schemas.MediaTerrainRoadKeyRequest, () => notAvailableYet(), invalid);
  handle(CHANNELS.mediaTerrainExport, schemas.MediaTerrainExportRequest, () => notAvailableYet(), invalid);
}
