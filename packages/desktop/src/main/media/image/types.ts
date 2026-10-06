import type { ImageAspect, ImageProviderId } from '@midnite/studio-shared';

/**
 * The `ImageProvider` seam (Phase 99 Theme C). One adapter per provider; the
 * image service owns keys, files, sidecars and progress, so an adapter is
 * only "prompt in, bytes out" — which is what keeps each one testable against
 * a fake `fetch` with no network and no key.
 */
export type ImageAdapterRequest = {
  prompt: string;
  model: string;
  aspect: ImageAspect;
  count: number;
  seed?: number | undefined;
  /**
   * Ask for a real transparent background (Phase 106 Theme B). Only OpenAI honours it; every other
   * adapter ignores it and the sprite pipeline keys a chroma background instead.
   */
  transparent?: boolean | undefined;
};

export type GeneratedImage = { bytes: Buffer; mime: string };

export type ImageAdapterDeps = {
  fetch: typeof fetch;
  /** From the secrets vault; `null` for providers that need none. */
  apiKey: string | null;
  signal: AbortSignal;
  /** Called after each image when an adapter generates one request at a time. */
  onImage?: (image: GeneratedImage) => void;
};

export interface ImageProvider {
  id: ImageProviderId;
  generate: (req: ImageAdapterRequest, deps: ImageAdapterDeps) => Promise<GeneratedImage[]>;
}

/** A provider error the user can act on — the message is shown verbatim. */
export class ImageProviderError extends Error {}

export const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Read a JSON error body into one line, never echoing request headers. */
export async function responseError(provider: string, res: Response): Promise<ImageProviderError> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string };
    const err = body.error;
    detail = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : '';
  } catch {
    // Non-JSON body — the status alone is the message.
  }
  return new ImageProviderError(`${provider} returned ${res.status}${detail ? `: ${detail}` : '.'}`);
}
