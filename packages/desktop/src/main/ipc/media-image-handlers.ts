import {
  agyImageProvider,
  createImageService,
  createOllamaImageProvider,
  geminiImageProvider,
  imageCapableModels,
  isAgyInstalled,
  mediaImagesMain,
  openaiImageProvider,
} from '@midnite/studio-feature-media-images/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, failure, MediaTabSchema, ok } from '@midnite/studio-shared';
import { ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
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

export const imageService = createImageService({
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
  agyAvailable: isAgyInstalled,
  readReference: async (repoId, path) => {
    // `<tab>/<project>/<path…>` inside the repo's `.midnite/media/`, confined by the media store.
    const [tab, project, ...rest] = path.split('/');
    const parsedTab = MediaTabSchema.safeParse(tab);
    if (!parsedTab.success || !project || rest.length === 0) return failure(`Reference ${path} is not a media file.`);
    const read = await mediaStore.readBytes({ repoId, tab: parsedTab.data, project, path: rest.join('/') });
    if (!read.ok) return read;
    const ext = path.split('.').pop()?.toLowerCase();
    return ok({ bytes: read.value, mime: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png' });
  },
});

/** Studio's composition of the Images feature's main half (Phase 113 Theme Q). */
export function registerMediaImageHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('images never trash through this context')),
  };
  mediaImagesMain.register(ctx, { images: imageService });
}
