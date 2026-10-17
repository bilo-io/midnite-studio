import type { GitOpResult, ImageAspect, ImageProviderId, ModelEngine } from '@midnite/studio-shared';

/**
 * The shapes of what Sprites calls on other features' main halves (Phase 113 Theme S).
 *
 * A feature may not import another, so Sprite declares the function types it needs here and the composer
 * passes in the Images service's `generateImage`, the Model engines' `visionCall` and `llmCall`, and the
 * Terrain feature's `bakeSplat`. Each is structural: the real implementation satisfies it without either
 * side naming the other.
 */

/** One generated image: the bytes and their mime type (Images' `GeneratedImage`). */
export type GeneratedImage = { bytes: Buffer; mime: string };

/** One image as bytes, not written anywhere — what the frame sources draw with (Images' `ImageBytesRequest`). */
export type ImageBytesRequest = {
  provider: ImageProviderId;
  model: string;
  prompt: string;
  aspect: ImageAspect;
  transparent?: boolean | undefined;
  references?: readonly GeneratedImage[] | undefined;
  signal: AbortSignal;
};

/** Draws an image with the configured provider (`createImageService(...).generateImage`). */
export type GenerateImage = (req: ImageBytesRequest) => Promise<GitOpResult<GeneratedImage>>;

/** Asks a vision model about images (`createVisionCall(engines)` — the Model engines'). */
export type VisionCall = (req: {
  images: string[];
  prompt: string;
  visionModel?: string;
  json?: boolean;
  signal?: AbortSignal;
}) => Promise<GitOpResult<{ text: string; model: string }>>;

/** Asks the Models engine for text (`createLlmCall(engines)`). */
export type LlmCall = (req: {
  engine: ModelEngine;
  /** Where an agent CLI runs (its working directory). */
  repoId: string;
  prompt: string;
  signal: AbortSignal;
  /** The first reply writes the spec; repairs reuse the same call. */
  json: boolean;
}) => Promise<GitOpResult<{ text: string }>>;

/** A `textureSize²` bake of a built terrain's splat blend (Terrain's `bakeSplat`), or null without one. */
export type BakeSplat = (built: { build: string }, size: number) => Promise<Uint8Array | null>;
