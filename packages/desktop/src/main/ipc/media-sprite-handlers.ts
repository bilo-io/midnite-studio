import { BrowserWindow, dialog, nativeImage, shell } from 'electron';

import { createSpriteRuntime, mediaSpriteMain } from '@midnite/studio-feature-media-sprite/main';
import { bakeSplat } from '@midnite/studio-feature-media-terrain/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createLlmCall, createVisionCall } from '@midnite/studio-feature-media-model/main';
import { createSpriteTools } from '../media/sprite/sprite-mcp';
import { setSpriteTools } from '../mcp/sprite-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows, resolveRole, windowForRole } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { imageService } from './media-image-handlers';
import { mediaStore, notifyMediaChanged } from './media-handlers';
import { engines } from './media-model-handlers';

/**
 * Media ▸ Sprites (Phase 106): precise 2D assets, composed here from the `media-sprite` feature
 * (Phase 113 Theme S). The feature owns the service, the five frame sources, the export and the eleven
 * channels; this is Studio's Electron-bound half of them — `nativeImage`, the Trash, the focused window
 * that renders from 3D, and the three seams Sprites asks of other features: the Images service, the Model
 * engines and Terrain's splat bake. Gamer wires its own.
 */

/** The focused main window, else the first one: the window whose `SpriteRenderHost` renders. */
function renderWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  const win = focused && !focused.isDestroyed() && resolveRole(focused) === 'main' ? focused : windowForRole('main');
  return win && !win.isDestroyed() ? win : null;
}

const toPng = async (bytes: Uint8Array): Promise<Buffer | null> => {
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  return image.isEmpty() ? null : image.toPNG();
};

const runtime = createSpriteRuntime({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'sprite' }),
  writeBytes: (req) => mediaStore.writeBytes({ repoId: req.repoId, tab: 'sprite', project: req.project, path: req.path, data: req.data }),
  trash: (absPath) => shell.trashItem(absPath),
  toPng,
  onChanged: (repoId) => notifyMediaChanged(repoId, 'sprite'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteProgress, event),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteChanged, event),
  log: (line) => defaultLogger.info(line),
  generateImage: (req) => imageService.generateImage(req),
  visionCall: createVisionCall(engines),
  llmCall: createLlmCall(engines),
  bakeSplat,
  terrainRootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'terrain' }),
  sendRenderRequest: (event) => {
    const win = renderWindow();
    if (!win) return false;
    win.webContents.send(EVENT_CHANNELS.mediaSpriteRenderRequest, event);
    return true;
  },
});

export const spriteService = runtime.service;

/**
 * The sprite MCP tools (Theme K), over the same service as the tab. The app's global MCP server answers
 * them behind the `allowSprites` switch (`mcp/sprite-tools.ts`); `sprite_open` is broadcast to every
 * window, which the Sprites tab answers by selecting that asset.
 */
setSpriteTools(
  createSpriteTools({
    service: spriteService,
    resolveRepo: async (repoPath) => {
      const resolved = await resolveRegisteredRepo(repoPath);
      if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id, repoRoot: resolved.repo.repoRoot };
      return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
    },
    rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'sprite' }),
    listFiles: (scope) => mediaStore.listFiles(scope),
    emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteOpen, event),
  }),
);

export function registerMediaSpriteHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('sprites never trash through this context')),
  };
  mediaSpriteMain.register(ctx, {
    runtime,
    pickTiledMap: async () => {
      const win = BrowserWindow.getFocusedWindow();
      const options = { title: 'Import a Tiled map', properties: ['openFile' as const], filters: [{ name: 'Tiled map', extensions: ['tmj', 'json'] }] };
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
    },
  });
}
