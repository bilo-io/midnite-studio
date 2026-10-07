import { BrowserWindow, nativeImage, shell } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, schemas, SPRITE_FRAME_SOURCES_PENDING } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createVisionCall } from '../media/model/engines';
import { createHandDrawnRunner, handDrawnPreflight } from '../media/sprite/hand-drawn';
import { createRenderRelay } from '../media/sprite/render-relay';
import { createRenderedRunner } from '../media/sprite/rendered';
import { createSpriteService, spriteNotAvailableYet, type SpriteJobRunner } from '../media/sprite/sprite-service';
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
 * job, and rendered from 3D (Theme E), whose frames come from the focused main window through the
 * render relay; one-shot (F) still ends `failed` with a plain message until it lands.
 * `export` (Theme G) answers "not available yet" — a half landing must never hang the renderer on an
 * unregistered channel.
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

const runJob: SpriteJobRunner = (ctx) => {
  if (ctx.turnaround || (ctx.spec.kind === 'sheet' && ctx.spec.method === 'hand-drawn')) return handDrawn(ctx);
  if (ctx.spec.kind === 'sheet' && ctx.spec.method === 'rendered') return rendered(ctx);
  return Promise.reject(new Error(SPRITE_FRAME_SOURCES_PENDING));
};

export const spriteService = createSpriteService({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'sprite' }),
  writeBytes: (req) => mediaStore.writeBytes({ repoId: req.repoId, tab: 'sprite', project: req.project, path: req.path, data: req.data }),
  trash: (absPath) => shell.trashItem(absPath),
  toPng: async (bytes) => {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    return image.isEmpty() ? null : image.toPNG();
  },
  onChanged: (repoId) => notifyMediaChanged(repoId, 'sprite'),
  emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteProgress, event),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaSpriteChanged, event),
  log: (line) => defaultLogger.info(line),
  runJob,
  preflight: handDrawnPreflight,
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
  handle(CHANNELS.mediaSpriteExport, schemas.MediaSpriteExportRequest, () => spriteNotAvailableYet(), invalid);
  handle(CHANNELS.mediaSpriteRenderReady, schemas.MediaSpriteRenderReadyRequest, ({ jobId }) => renderRelay.ready(jobId), invalid);
  handle(CHANNELS.mediaSpriteRenderFrames, schemas.MediaSpriteRenderFramesRequest, (req) => renderRelay.frames(req), invalid);
}
