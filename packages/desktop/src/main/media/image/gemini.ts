import type { ImageAspect } from '@midnite/studio-shared';

import { ImageProviderError, responseError, type GeneratedImage, type ImageProvider } from './types';

/**
 * Gemini API (Google AI Studio key, `x-goog-api-key`). Two request shapes:
 *
 * - `gemini-*-image` models answer `models/{model}:generateContent` with
 *   `responseModalities: ['IMAGE']`; the image comes back as a part's
 *   `inlineData` (`{mimeType, data}` base64). One image per call, so `count`
 *   runs sequentially.
 * - `imagen-*` models answer `models/{model}:predict` with
 *   `parameters.sampleCount`; images are `predictions[].bytesBase64Encoded`.
 */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Imagen accepts 1:1, 3:4, 4:3, 9:16, 16:9 — 3:2/2:3 map to the nearest. */
export const IMAGEN_ASPECT: Record<ImageAspect, string> = {
  '1:1': '1:1',
  '3:2': '4:3',
  '2:3': '3:4',
  '16:9': '16:9',
  '9:16': '9:16',
};

export const isImagenModel = (model: string): boolean => model.startsWith('imagen-');

export function geminiGenerateContentBody(prompt: string, aspect: ImageAspect, seed?: number) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: aspect },
      ...(seed !== undefined ? { seed } : {}),
    },
  };
}

export function imagenPredictBody(prompt: string, aspect: ImageAspect, count: number, seed?: number) {
  return {
    instances: [{ prompt }],
    parameters: {
      sampleCount: count,
      aspectRatio: IMAGEN_ASPECT[aspect],
      ...(seed !== undefined ? { seed, addWatermark: false } : {}),
    },
  };
}

type InlineData = { mimeType?: string; data?: string };
type GenerateContentResponse = {
  candidates?: { content?: { parts?: { inlineData?: InlineData; text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
};

export function parseGenerateContent(body: GenerateContentResponse): GeneratedImage[] {
  const images: GeneratedImage[] = [];
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        images.push({
          bytes: Buffer.from(part.inlineData.data, 'base64'),
          mime: part.inlineData.mimeType ?? 'image/png',
        });
      }
    }
  }
  if (images.length === 0) {
    const reason = body.promptFeedback?.blockReason;
    throw new ImageProviderError(
      reason ? `Gemini blocked the prompt (${reason}).` : 'Gemini returned no image for this prompt.',
    );
  }
  return images;
}

type PredictResponse = { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] };

export function parsePredict(body: PredictResponse): GeneratedImage[] {
  const images = (body.predictions ?? [])
    .filter((p) => p.bytesBase64Encoded)
    .map((p) => ({ bytes: Buffer.from(p.bytesBase64Encoded!, 'base64'), mime: p.mimeType ?? 'image/png' }));
  if (images.length === 0) throw new ImageProviderError('Imagen returned no image for this prompt.');
  return images;
}

export const geminiImageProvider: ImageProvider = {
  id: 'gemini',
  async generate(req, deps) {
    if (!deps.apiKey) throw new ImageProviderError('Add a Gemini API key in Settings ▸ Media.');
    const headers = { 'content-type': 'application/json', 'x-goog-api-key': deps.apiKey };
    const model = encodeURIComponent(req.model);

    if (isImagenModel(req.model)) {
      const res = await deps.fetch(`${GEMINI_API_BASE}/models/${model}:predict`, {
        method: 'POST',
        headers,
        body: JSON.stringify(imagenPredictBody(req.prompt, req.aspect, req.count, req.seed)),
        signal: deps.signal,
      });
      if (!res.ok) throw await responseError('Gemini', res);
      const images = parsePredict((await res.json()) as PredictResponse);
      images.forEach((image) => deps.onImage?.(image));
      return images;
    }

    const images: GeneratedImage[] = [];
    for (let i = 0; i < req.count; i += 1) {
      const seed = req.seed === undefined ? undefined : req.seed + i;
      const res = await deps.fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(geminiGenerateContentBody(req.prompt, req.aspect, seed)),
        signal: deps.signal,
      });
      if (!res.ok) throw await responseError('Gemini', res);
      const [image] = parseGenerateContent((await res.json()) as GenerateContentResponse);
      images.push(image!);
      deps.onImage?.(image!);
    }
    return images;
  },
};
