import { nativeImage, shell, utilityProcess } from 'electron';

import {
  createTerrainRuntime,
  mediaTerrainMain,
  terrainWorkerScriptPath,
  type TerrainWorkerHandle,
} from '@midnite/studio-feature-media-terrain/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, failure } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { setTerrainTools } from '../mcp/terrain-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { createTerrainTools } from '../media/terrain/terrain-mcp';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { imageService } from './media-image-handlers';
import { mediaStore, notifyMediaChanged } from './media-handlers';

/**
 * Media ▸ Terrain (Phase 105): a heightfield from up to three optional images, composed here from the
 * `media-terrain` feature (Phase 113 Theme S). The build runs in `terrain-worker`, a utility process, so a
 * 4097² terrain never blocks a frame. The feature owns the service and the nine channels; this is Studio's
 * Electron-bound half of them — the Trash, `nativeImage`, the worker fork, the Images hand-off for a
 * prompted heightmap and the media store — which Gamer wires its own way.
 */
const runtime = createTerrainRuntime({
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
  // A prompted heightmap is generated into the Images tab (reusable there), then read back as bytes.
  generateImage: async (req) => {
    const generated = await imageService.generate({ ...req, aspect: '1:1', count: 1 });
    if (!generated.ok) return generated;
    const file = generated.value.files[0];
    if (!file) return failure('The image provider returned no image.');
    const read = await mediaStore.readFile({ repoId: req.repoId, tab: 'image', project: req.project, path: file, encoding: 'base64' });
    if (!read.ok) return read;
    return { ok: true, value: { bytes: Buffer.from(read.value, 'base64'), name: file } };
  },
  spawnWorker: () => utilityProcess.fork(terrainWorkerScriptPath(), [], { serviceName: 'mstudio-terrain', stdio: 'ignore' }) as TerrainWorkerHandle,
  onChanged: (repoId) => notifyMediaChanged(repoId, 'terrain'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainProgress, event),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainChanged, event),
  log: (line) => defaultLogger.info(line),
});

const service = runtime.service;

/** Ends the worker on quit, failing any build still outstanding. */
export function disposeTerrainBroker(): void {
  runtime.dispose();
}

/** The one terrain service, for main-side callers (the Maps capture hand-off) that must not round-trip the renderer. */
export function terrainService(): typeof service {
  return service;
}

/**
 * The `terrain_*` MCP tools, over the same service as the tab. The app's global MCP server answers
 * them behind the `allowTerrains` switch (`mcp/terrain-tools.ts`); `terrain_open` is broadcast to
 * every window, which the Terrain tab answers by selecting that terrain.
 */
setTerrainTools(
  createTerrainTools({
    service,
    resolveRepo: async (repoPath) => {
      const resolved = await resolveRegisteredRepo(repoPath);
      if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id, repoRoot: resolved.repo.repoRoot };
      return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
    },
    listProjects: (repoId) => mediaStore.listProjects({ repoId, tab: 'terrain' }),
    listFiles: (scope) => mediaStore.listFiles(scope),
    emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaTerrainOpen, event),
  }),
);

export function registerMediaTerrainHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('terrain trashes through its own dependency, not this context')),
  };
  mediaTerrainMain.register(ctx, { service });
}
