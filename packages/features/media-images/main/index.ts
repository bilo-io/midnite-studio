import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { mediaImagesManifest } from '../manifest';
import type { ImageService } from './image-service';

export { mediaImagesManifest, type MediaImagesManifest } from '../manifest';
export { agyImageProvider, createAgyImageProvider, isAgyInstalled } from './agy';
export { geminiImageProvider } from './gemini';
export { createImageService, type ImageBytesRequest, type ImageService, type ImageServiceDeps } from './image-service';
export { createOllamaImageProvider, imageCapableModels } from './ollama';
export { openaiImageProvider } from './openai';
export type { GeneratedImage, ImageProvider } from './types';

/**
 * The Images feature's main half (Phase 113 Theme Q): provider status, image
 * generation and cancel. The service is built by the composer — it decides
 * where keys come from (`readKey`, the vault), where files land (media-core's
 * store) and where progress goes — so this module never sees a key's source
 * and never imports `electron`.
 */
export type MediaImagesMainServices = {
  images: ImageService;
};

export const mediaImagesMain = defineFeatureMain<MediaImagesMainServices>({
  feature: mediaImagesManifest.feature,
  channels: mediaImagesManifest.ipc,
  register(ctx, { images }) {
    const invalid = (issue: string) => failure(issue);
    ctx.ipc.handleBare(CHANNELS.mediaImageProviders, async () => ({ providers: await images.providerStatuses() }));
    ctx.ipc.handle(
      CHANNELS.mediaImageGenerate,
      schemas.MediaImageGenerateRequest,
      async (req) => {
        try {
          return await images.generate(req);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaImageCancel,
      schemas.MediaImageCancelRequest,
      ({ generationId }) => images.cancel(generationId),
      invalid,
    );
  },
});
