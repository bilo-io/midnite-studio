import type { ImageAspect } from '@midnite/studio-shared';

import { ImageProviderError, responseError, type GeneratedImage, type ImageProvider } from './types';

/**
 * OpenAI Images API — `POST /v1/images/generations` with a bearer key.
 * `gpt-image-*` models always answer `data[].b64_json` and take `n` for the
 * count; they have three sizes, so the aspect maps to the nearest.
 */
export const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
/** With reference images the request becomes an edit: multipart, one `image[]` part per reference. */
export const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits';

export const OPENAI_SIZE: Record<ImageAspect, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '16:9': '1536x1024',
  '2:3': '1024x1536',
  '9:16': '1024x1536',
};

/** With `transparent`, gpt-image returns real alpha (`background: 'transparent'` needs PNG output). */
export function openaiRequestBody(prompt: string, model: string, aspect: ImageAspect, count: number, transparent = false) {
  return { model, prompt, n: count, size: OPENAI_SIZE[aspect], output_format: 'png', ...(transparent ? { background: 'transparent' } : {}) };
}

/** The `/v1/images/edits` form: the generation fields as strings plus each reference as `image[]`. */
export function openaiEditsForm(
  prompt: string,
  model: string,
  aspect: ImageAspect,
  count: number,
  references: readonly GeneratedImage[],
  transparent = false,
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(openaiRequestBody(prompt, model, aspect, count, transparent))) form.append(key, String(value));
  references.forEach((ref, i) => {
    const ext = ref.mime === 'image/jpeg' ? 'jpg' : ref.mime === 'image/webp' ? 'webp' : 'png';
    form.append('image[]', new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }), `reference-${i + 1}.${ext}`);
  });
  return form;
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
    const transparent = req.transparent === true;
    const res = req.references?.length
      ? // No content-type header: fetch sets the multipart boundary itself.
        await deps.fetch(OPENAI_EDITS_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${deps.apiKey}` },
          body: openaiEditsForm(req.prompt, req.model, req.aspect, req.count, req.references, transparent),
          signal: deps.signal,
        })
      : await deps.fetch(OPENAI_IMAGES_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.apiKey}` },
          body: JSON.stringify(openaiRequestBody(req.prompt, req.model, req.aspect, req.count, transparent)),
          signal: deps.signal,
        });
    if (!res.ok) throw await responseError('OpenAI', res);
    const images = parseOpenaiImages((await res.json()) as ImagesResponse);
    images.forEach((image) => deps.onImage?.(image));
    return images;
  },
};
