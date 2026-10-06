import { nativeImage, shell } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { createSpriteService, spriteNotAvailableYet } from '../media/sprite/sprite-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle } from './handle';
import { mediaStore, notifyMediaChanged } from './media-handlers';

/**
 * Media ▸ Sprites (Phase 106): precise 2D assets. This is the thin Electron-bound shell around
 * `main/media/sprite/sprite-service.ts`, which is also what MCP will call (Theme K).
 *
 * No frame source is installed yet (Themes D, E, F plug a `runJob` in here), so a started job ends
 * `failed` with a plain message. `export` (Theme G) answers "not available yet" — a half landing
 * must never hang the renderer on an unregistered channel.
 */
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
}
