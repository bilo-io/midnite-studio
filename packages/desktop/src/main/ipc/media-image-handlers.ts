import { CHANNELS, EVENT_CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { agyImageProvider } from '../media/image/agy';
import { geminiImageProvider } from '../media/image/gemini';
import { createImageService } from '../media/image/image-service';
import { createOllamaImageProvider, imageCapableModels } from '../media/image/ollama';
import { openaiImageProvider } from '../media/image/openai';
import { ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare } from './handle';
import { mediaStore } from './media-handlers';
import { readSecret } from './secrets-handlers';

/**
 * Media ▸ Images (Phase 99 Theme C) — provider status, generation and cancel.
 * Keys come from the secrets vault here in main; the renderer only ever
 * learns whether one is set.
 */
const ollamaBaseUrl = async (): Promise<string> => (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();

async function discoverOllamaImageModels() {
  const baseUrl = await ollamaBaseUrl();
  const tags = await ollamaTags({ baseUrl, timeoutMs: 1500 });
  const shown = await Promise.all(
    tags.map(async (tag) => {
      try {
        const detail = await ollamaShow(tag.name, { baseUrl, timeoutMs: 1500 });
        return { name: tag.name, capabilities: detail.capabilities ?? [] };
      } catch {
        return { name: tag.name, capabilities: [] };
      }
    }),
  );
  return imageCapableModels(shown);
}

const service = createImageService({
  providers: {
    gemini: geminiImageProvider,
    openai: openaiImageProvider,
    agy: agyImageProvider,
    ollama: createOllamaImageProvider(ollamaBaseUrl),
  },
  readKey: readSecret,
  writeFile: (req) => mediaStore.writeFile(req),
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaImageProgress, event),
  fetch: (input, init) => fetch(input, init),
  discoverOllamaModels: discoverOllamaImageModels,
});

export function registerMediaImageHandlers(): void {
  handleBare(CHANNELS.mediaImageProviders, async () => ({ providers: await service.providerStatuses() }));
  handle(
    CHANNELS.mediaImageGenerate,
    schemas.MediaImageGenerateRequest,
    async (req) => {
      try {
        return await service.generate(req);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaImageCancel,
    schemas.MediaImageCancelRequest,
    ({ generationId }) => service.cancel(generationId),
    (issue) => failure(issue),
  );
}
