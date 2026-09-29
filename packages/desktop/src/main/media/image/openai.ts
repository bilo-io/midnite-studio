import type { ImageAspect } from '@midnite/studio-shared';

import { ImageProviderError, responseError, type GeneratedImage, type ImageProvider } from './types';

/**
 * OpenAI Images API — `POST /v1/images/generations` with a bearer key.
 * `gpt-image-*` models always answer `data[].b64_json` and take `n` for the
 * count; they have three sizes, so the aspect maps to the nearest.
 */
export const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

export const OPENAI_SIZE: Record<ImageAspect, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '16:9': '1536x1024',
  '2:3': '1024x1536',
  '9:16': '1024x1536',
};

export function openaiRequestBody(prompt: string, model: string, aspect: ImageAspect, count: number) {
  return { model, prompt, n: count, size: OPENAI_SIZE[aspect], output_format: 'png' };
}

type ImagesResponse = { data?: { b64_json?: string }[] };

export function parseOpenaiImages(body: ImagesResponse): GeneratedImage[] {
  const images = (body.data ?? [])
    .filter((d) => d.b64_json)
    .map((d) => ({ bytes: Buffer.from(d.b64_json!, 'base64'), mime: 'image/png' }));
  if (images.length === 0) throw new ImageProviderError('OpenAI returned no image for this prompt.');
  return images;
}

export const openaiImageProvider: ImageProvider = {
  id: 'openai',
  async generate(req, deps) {
    if (!deps.apiKey) throw new ImageProviderError('Add an OpenAI API key in Settings ▸ Media.');
    const res = await deps.fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.apiKey}` },
      body: JSON.stringify(openaiRequestBody(req.prompt, req.model, req.aspect, req.count)),
      signal: deps.signal,
    });
    if (!res.ok) throw await responseError('OpenAI', res);
    const images = parseOpenaiImages((await res.json()) as ImagesResponse);
    images.forEach((image) => deps.onImage?.(image));
    return images;
  },
};
