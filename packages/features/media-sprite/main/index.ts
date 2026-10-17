import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { mediaSpriteManifest } from '../manifest';
import { readTmjForImport } from './sprite/map-import';
import type { SpriteRuntime } from './sprite/sprite-runtime';

export { mediaSpriteManifest, type MediaSpriteManifest } from '../manifest';
export { createSpriteRuntime, type SpriteRuntime, type SpriteRuntimeDeps } from './sprite/sprite-runtime';
export { createSpriteService, type SpriteJobContext, type SpriteJobRunner, type SpriteService, type SpriteServiceDeps } from './sprite/sprite-service';
export { readTerrainSource } from './sprite/terrain-source';
export { renderSpritePreview } from './sprite/sprite-preview';
export { createMapRunner, mapPreflight } from './sprite/map-generate';
export { createRenderRelay, type RenderRelay } from './sprite/render-relay';
export { readTmjForImport } from './sprite/map-import';
export type { BakeSplat, GeneratedImage, GenerateImage, ImageBytesRequest, LlmCall, VisionCall } from './sprite/ports';

/**
 * The Sprite feature's main half (Phase 113 Theme S): precise 2D assets — `sprite.json` per asset, the
 * five frame sources, the atlas export and the hidden-renderer relay. `sprite-runtime.ts` wires the
 * services from injected deps; this file registers their eleven channels.
 *
 * The one native dialog it needs — "Import a Tiled map" — arrives as `pickTiledMap` (the composer's
 * `dialog.showOpenDialog`), so nothing here imports `electron`.
 */
export type MediaSpriteMainServices = {
  runtime: SpriteRuntime;
  /** The Tiled map picker: an absolute path, or null when dismissed. */
  pickTiledMap: () => Promise<string | null>;
};

export const mediaSpriteMain = defineFeatureMain<MediaSpriteMainServices>({
  feature: mediaSpriteManifest.feature,
  channels: mediaSpriteManifest.ipc,
  register(ctx, { runtime, pickTiledMap }) {
    const { handle } = ctx.ipc;
    const { service, renderRelay } = runtime;
    const invalid = (issue: string) => failure(issue);
    handle(CHANNELS.mediaSpriteLibrary, schemas.MediaSpriteLibraryRequest, (req) => service.library(req), invalid);
    handle(CHANNELS.mediaSpriteGet, schemas.MediaSpriteGetRequest, (req) => service.get(req), invalid);
    handle(CHANNELS.mediaSpriteSetSpec, schemas.MediaSpriteSetSpecRequest, (req) => service.setSpec(req), invalid);
    handle(CHANNELS.mediaSpriteSetReference, schemas.MediaSpriteSetReferenceRequest, (req) => service.setReference(req), invalid);
    handle(CHANNELS.mediaSpriteGenerate, schemas.MediaSpriteGenerateRequest, (req) => service.generate(req), invalid);
    handle(CHANNELS.mediaSpriteCancel, schemas.MediaSpriteCancelRequest, ({ jobId }) => service.cancel(jobId), invalid);
    handle(CHANNELS.mediaSpritePatchFrames, schemas.MediaSpritePatchFramesRequest, (req) => service.patchFrames(req), invalid);
    handle(CHANNELS.mediaSpriteExport, schemas.MediaSpriteExportRequest, (req) => service.export(req), invalid);
    handle(
      CHANNELS.mediaSpriteImportMap,
      schemas.MediaSpriteImportMapRequest,
      async ({ repoId, path }) => {
        const file = path ?? (await pickTiledMap());
        if (!file) return { ok: true as const, value: {} };
        const read = await readTmjForImport(file);
        if (!read.ok) return read;
        return service.importMap({ repoId, name: read.value.name, files: read.value.files, tiles: read.value.tiles });
      },
      invalid,
    );
    handle(CHANNELS.mediaSpriteRenderReady, schemas.MediaSpriteRenderReadyRequest, ({ jobId }) => renderRelay.ready(jobId), invalid);
    handle(CHANNELS.mediaSpriteRenderFrames, schemas.MediaSpriteRenderFramesRequest, (req) => renderRelay.frames(req), invalid);
  },
});
