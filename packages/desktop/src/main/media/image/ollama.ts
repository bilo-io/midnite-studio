import type { ImageAspect, ImageModelInfo } from '@midnite/studio-shared';

import { ImageProviderError, responseError, type GeneratedImage, type ImageProvider } from './types';

/**
 * Ollama's experimental image generation: `POST /api/generate` against a
 * model whose `/api/show` `capabilities` include `image`, non-streaming. The
 * image arrives base64 as `image` (current builds) or `images[]` — both are
 * read. Only models reporting image output are offered; with none, the
 * provider is hidden in the picker.
 */
export const OLLAMA_IMAGE_DIMENSIONS: Record<ImageAspect, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '3:2': { width: 1216, height: 832 },
  '2:3': { width: 832, height: 1216 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
};

export function ollamaImageRequestBody(model: string, prompt: string, aspect: ImageAspect, seed?: number) {
  return {
    model,
    prompt,
    stream: false,
    ...OLLAMA_IMAGE_DIMENSIONS[aspect],
    ...(seed !== undefined ? { options: { seed } } : {}),
  };
}

type GenerateResponse = { image?: string; images?: string[]; error?: string };

export function parseOllamaImage(body: GenerateResponse): GeneratedImage {
  const data = body.image ?? body.images?.[0];
  if (!data) throw new ImageProviderError(body.error ?? 'Ollama returned no image — is this an image model?');
  return { bytes: Buffer.from(data, 'base64'), mime: 'image/png' };
}

/** Pick the image-output models from `name → capabilities`. */
export function imageCapableModels(models: { name: string; capabilities: string[] }[]): ImageModelInfo[] {
  return models.filter((m) => m.capabilities.includes('image')).map((m) => ({ id: m.name, label: m.name }));
}

export function createOllamaImageProvider(baseUrl: () => Promise<string>): ImageProvider {
  return {
    id: 'ollama',
    async generate(req, deps) {
      const url = `${await baseUrl()}/api/generate`;
      const images: GeneratedImage[] = [];
      for (let i = 0; i < req.count; i += 1) {
        const seed = req.seed === undefined ? undefined : req.seed + i;
        const res = await deps.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(ollamaImageRequestBody(req.model, req.prompt, req.aspect, seed)),
          signal: deps.signal,
        });
        if (!res.ok) throw await responseError('Ollama', res);
        const image = parseOllamaImage((await res.json()) as GenerateResponse);
        images.push(image);
        deps.onImage?.(image);
      }
      return images;
    },
  };
}
