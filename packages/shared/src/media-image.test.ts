import { describe, expect, it } from 'vitest';

import { SECRET_KEYS } from './domain/secrets';
import {
  DEFAULT_IMAGE_PROVIDER,
  IMAGE_PROVIDER_IDS,
  IMAGE_PROVIDERS,
  ImageGenerateRequestSchema,
  imageModelsFor,
  imageProviderInfo,
  imageSidecarPath,
  isImagePath,
  parseImageSidecar,
} from './media';

describe('image provider catalogue (Phase 99 Theme C)', () => {
  it('lists every provider once, in id order, with Gemini as the default', () => {
    expect(IMAGE_PROVIDERS.map((p) => p.id)).toEqual([...IMAGE_PROVIDER_IDS]);
    expect(DEFAULT_IMAGE_PROVIDER).toBe('gemini');
    expect(imageProviderInfo('gemini').disabledReason).toBeUndefined();
  });

  it('keeps agy listed but disabled with a reason', () => {
    expect(imageProviderInfo('agy').disabledReason).toMatch(/headless/);
  });

  it('names only vault keys that exist', () => {
    for (const p of IMAGE_PROVIDERS) {
      if (p.secretKey) expect(SECRET_KEYS).toContain(p.secretKey);
    }
  });

  it('filters models per provider, falling back to discovery for Ollama', () => {
    expect(imageModelsFor('openai').map((m) => m.id)).toEqual(['gpt-image-1', 'gpt-image-1-mini']);
    expect(imageModelsFor('gemini').every((m) => /image|imagen/.test(m.id))).toBe(true);
    expect(imageModelsFor('ollama')).toEqual([]);
    const discovered = [{ id: 'x/z-image-turbo', label: 'z-image' }];
    expect(imageModelsFor('ollama', discovered)).toBe(discovered);
    // A static catalogue is never overridden by discovery.
    expect(imageModelsFor('openai', discovered)).not.toBe(discovered);
  });
});

describe('image sidecars', () => {
  const sidecar = {
    version: 1,
    file: 'fox.png',
    prompt: 'a fox',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    aspect: '1:1',
    seed: 3,
    createdAt: '2026-09-30T12:00:00.000Z',
  };

  it('parses a valid sidecar and rejects junk, foreign JSON and bad enums', () => {
    expect(parseImageSidecar(JSON.stringify(sidecar))).toEqual(sidecar);
    expect(parseImageSidecar('not json')).toBeNull();
    expect(parseImageSidecar(JSON.stringify({ name: 'package' }))).toBeNull();
    expect(parseImageSidecar(JSON.stringify({ ...sidecar, provider: 'midjourney' }))).toBeNull();
    expect(parseImageSidecar(JSON.stringify({ ...sidecar, aspect: '5:4' }))).toBeNull();
  });

  it('pairs each image with a same-stem .json', () => {
    expect(imageSidecarPath('fox-1.png')).toBe('fox-1.json');
    expect(imageSidecarPath('a.b/fox.webp')).toBe('a.b/fox.json');
    expect(isImagePath('x.JPG')).toBe(true);
    expect(isImagePath('x.json')).toBe(false);
  });

  it('bounds the generate request', () => {
    const base = { generationId: 'g', repoId: 'r', project: 'p', prompt: 'hi', provider: 'gemini', model: 'm' };
    expect(ImageGenerateRequestSchema.parse(base)).toMatchObject({ count: 1, aspect: '1:1' });
    expect(ImageGenerateRequestSchema.safeParse({ ...base, count: 9 }).success).toBe(false);
    expect(ImageGenerateRequestSchema.safeParse({ ...base, prompt: '   ' }).success).toBe(false);
    expect(ImageGenerateRequestSchema.safeParse({ ...base, project: '../x' }).success).toBe(false);
  });
});
