import { BrowserWindow, dialog, nativeImage, shell } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, schemas, SPRITE_FRAME_SOURCES_PENDING } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createLlmCall, createVisionCall } from '../media/model/engines';
import { createHandDrawnRunner, handDrawnPreflight } from '../media/sprite/hand-drawn';
import { createOneShotRunner, oneShotPreflight } from '../media/sprite/one-shot';
import { createRenderRelay } from '../media/sprite/render-relay';
import { createRenderedRunner } from '../media/sprite/rendered';
import { backgroundPreflight, createBackgroundRunner, createPropsRunner, propsPreflight } from '../media/sprite/environment';
import { createSpriteService, type SpriteJobRunner } from '../media/sprite/sprite-service';
import { readTerrainSource } from '../media/sprite/terrain-source';
import { createTilesetRunner, tilesetPreflight } from '../media/sprite/tileset';
import { createMapRunner, mapPreflight } from '../media/sprite/map-generate';
import { readTmjForImport } from '../media/sprite/map-import';
import { broadcastToAllWindows, resolveRole, windowForRole } from '../window-manager';
import { handle } from './handle';
import { imageService } from './media-image-handlers';
import { mediaStore, notifyMediaChanged } from './media-handlers';
import { engines } from './media-model-handlers';

/**
 * Media ▸ Sprites (Phase 106): precise 2D assets. This is the thin Electron-bound shell around
 * `main/media/sprite/sprite-service.ts`, which is also what MCP will call (Theme K).
 *
 * Frame sources plug in through `runJob`, keyed by method: hand-drawn (Theme D) plus every turnaround
 * job, rendered from 3D (Theme E), whose frames come from the focused main window through the render
 * relay, and the one-shot sheet (Theme F). A job's `method` override (one-shot's "Regenerate this clip
 * with Hand-drawn") arrives here already applied to `ctx.spec`.
 * Environments (Themes H and I) are frame sources too: tilesets (and terrain-to-tiles), parallax
 * backgrounds and prop sheets. `export` (Theme G) packs the atlas into the asset's `export/` and, with a
 * destination, a `<name>.sprite/` (`.tileset/`, `.background/`) folder there.
 */
const handDrawn = createHandDrawnRunner({ generateImage: (req) => imageService.generateImage(req), visionCall: createVisionCall(engines) });

/** The focused main window, else the first one: the window whose `SpriteRenderHost` renders. */
function renderWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  const win = focused && !focused.isDestroyed() && resolveRole(focused) === 'main' ? focused : windowForRole('main');
  return win && !win.isDestroyed() ? win : null;
}

const renderRelay = createRenderRelay({
  send: (event) => {
    const win = renderWindow();
    if (!win) return false;
    win.webContents.send(EVENT_CHANNELS.mediaSpriteRenderRequest, event);
    return true;
  },
});
const rendered = createRenderedRunner(renderRelay);

const toPng = async (bytes: Uint8Array): Promise<Buffer | null> => {
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  return image.isEmpty() ? null : image.toPNG();
};
const oneShot = createOneShotRunner({ generateImage: (req) => imageService.generateImage(req), toPng });

const environment = {
  generateImage: (req: Parameters<typeof imageService.generateImage>[0]) => imageService.generateImage(req),
  toPng,
  readTerrain: async (target: { repoId: string; project: string; terrain: string }) =>
    readTerrainSource(await mediaStore.rootFor({ repoId: target.repoId, tab: 'terrain' }), target.project, target.terrain),
};
const tileset = createTilesetRunner(environment);
const background = createBackgroundRunner(environment);
const props = createPropsRunner(environment);
const map = createMapRunner({ llmCall: createLlmCall(engines) });

const runJob: SpriteJobRunner = (ctx) => {
  if (ctx.spec.kind === 'tileset') return tileset(ctx);
  if (ctx.spec.kind === 'background') return background(ctx);
  if (ctx.spec.kind === 'prop-sheet') return props(ctx);
  if (ctx.spec.kind === 'map') return map(ctx);
  if (ctx.turnaround || (ctx.spec.kind === 'sheet' && ctx.spec.method === 'hand-drawn')) return handDrawn(ctx);
  if (ctx.spec.kind === 'sheet' && ctx.spec.method === 'rendered') return rendered(ctx);
  if (ctx.spec.kind === 'sheet' && ctx.spec.method === 'one-shot') return oneShot(ctx);
  return Promise.reject(new Error(SPRITE_FRAME_SOURCES_PENDING));
};

export const spriteService = createSpriteService({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'sprite' }),
  writeBytes: (req) => mediaStore.writeBytes({ repoId: req.repoId, tab: 'sprite', project: req.project, path: req.path, data: req.data }),
  trash: (absPath) => shell.trashItem(absPath),
  toPng,
  onChanged: (repoId) => notifyMediaChanged(repoId, 'sprite'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteProgress, event),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteChanged, event),
  log: (line) => defaultLogger.info(line),
  runJob,
  preflight: (spec, req) => handDrawnPreflight(spec, req) ?? oneShotPreflight(spec, req) ?? tilesetPreflight(spec, req) ?? backgroundPreflight(spec, req) ?? propsPreflight(spec, req) ?? mapPreflight(spec, req),
});

export function registerMediaSpriteHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaSpriteLibrary, schemas.MediaSpriteLibraryRequest, (req) => spriteService.library(req), invalid);
  handle(CHANNELS.mediaSpriteGet, schemas.MediaSpriteGetRequest, (req) => spriteService.get(req), invalid);
  handle(CHANNELS.mediaSpriteSetSpec, schemas.MediaSpriteSetSpecRequest, (req) => spriteService.setSpec(req), invalid);
  handle(CHANNELS.mediaSpriteSetReference, schemas.MediaSpriteSetReferenceRequest, (req) => spriteService.setReference(req), invalid);
  handle(CHANNELS.mediaSpriteGenerate, schemas.MediaSpriteGenerateRequest, (req) => spriteService.generate(req), invalid);
  handle(CHANNELS.mediaSpriteCancel, schemas.MediaSpriteCancelRequest, ({ jobId }) => spriteService.cancel(jobId), invalid);
  handle(CHANNELS.mediaSpritePatchFrames, schemas.MediaSpritePatchFramesRequest, (req) => spriteService.patchFrames(req), invalid);
  handle(CHANNELS.mediaSpriteExport, schemas.MediaSpriteExportRequest, (req) => spriteService.export(req), invalid);
  handle(
    CHANNELS.mediaSpriteImportMap,
    schemas.MediaSpriteImportMapRequest,
    async ({ repoId, path }) => {
      let file = path;
      if (!file) {
        const win = BrowserWindow.getFocusedWindow();
        const options = { title: 'Import a Tiled map', properties: ['openFile' as const], filters: [{ name: 'Tiled map', extensions: ['tmj', 'json'] }] };
        const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        if (picked.canceled || !picked.filePaths[0]) return { ok: true as const, value: {} };
        file = picked.filePaths[0];
      }
      const read = await readTmjForImport(file);
      if (!read.ok) return read;
      return spriteService.importMap({ repoId, name: read.value.name, files: read.value.files, tiles: read.value.tiles });
    },
    invalid,
  );
  handle(CHANNELS.mediaSpriteRenderReady, schemas.MediaSpriteRenderReadyRequest, ({ jobId }) => renderRelay.ready(jobId), invalid);
  handle(CHANNELS.mediaSpriteRenderFrames, schemas.MediaSpriteRenderFramesRequest, (req) => renderRelay.frames(req), invalid);
}
