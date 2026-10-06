import { failure, imageReferenceUnsupportedReason, ok, type ImageProviderId } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createImageService } from './image-service';
import type { ImageAdapterRequest, ImageProvider } from './types';

/**
 * Phase 106 Theme D: the image service carries reference images and transparency to the adapter,
 * and refuses a reference where the provider (or the key-less agy route) cannot take one.
 */
function setup(keys: Record<string, string> = { 'media.geminiApiKey': 'g', 'media.openaiApiKey': 'o' }) {
  const seen: Array<{ id: ImageProviderId; req: ImageAdapterRequest }> = [];
  const provider = (id: ImageProviderId): ImageProvider => ({
    id,
    generate: async (req, deps) => {
      seen.push({ id, req });
      const image = { bytes: Buffer.from('px'), mime: 'image/png' };
      deps.onImage?.(image);
      return [image];
    },
  });
  const writes: string[] = [];
  const service = createImageService({
    providers: { gemini: provider('gemini'), openai: provider('openai'), agy: provider('agy'), ollama: provider('ollama') },
    readKey: async (key) => keys[key] ?? null,
    writeFile: async (req) => {
      writes.push(req.path);
      return ok({ size: 1, largeFile: false });
    },
    emit: () => undefined,
    fetch: vi.fn() as unknown as typeof fetch,
    discoverOllamaModels: async () => [],
    agyAvailable: async () => true,
    readReference: async (_repoId, path) => (path.startsWith('sprite/') ? ok({ bytes: Buffer.from(`ref:${path}`), mime: 'image/png' }) : failure('File not found.')),
  });
  return { service, seen, writes };
}

const signal = new AbortController().signal;
const reference = { bytes: Buffer.from('ref'), mime: 'image/png' };

describe('image service references and transparency', () => {
  it('generateImage hands references and transparency to the adapter and writes nothing', async () => {
    const { service, seen, writes } = setup();
    const result = await service.generateImage({ provider: 'openai', model: 'gpt-image-1', prompt: 'p', aspect: '1:1', transparent: true, references: [reference], signal });
    expect(result.ok).toBe(true);
    expect(seen[0]).toMatchObject({ id: 'openai', req: { count: 1, transparent: true, references: [reference] } });
    expect(writes).toEqual([]);
  });

  it('refuses a reference for providers and models that cannot take one', async () => {
    const { service, seen } = setup();
    expect(await service.generateImage({ provider: 'agy', model: 'agy-default', prompt: 'p', aspect: '1:1', references: [reference], signal })).toEqual(
      failure(imageReferenceUnsupportedReason('Antigravity CLI')),
    );
    expect(await service.generateImage({ provider: 'gemini', model: 'imagen-4.0-generate-001', prompt: 'p', aspect: '1:1', references: [reference], signal })).toEqual(
      failure(imageReferenceUnsupportedReason('Imagen')),
    );
    expect(seen).toEqual([]);
  });

  it('does not fall back to the key-less agy route when a reference is attached', async () => {
    const { service, seen } = setup({});
    const result = await service.generateImage({ provider: 'gemini', model: 'gemini-2.5-flash-image', prompt: 'p', aspect: '1:1', references: [reference], signal });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.kind === 'error' ? result.message : '').toMatch(/needs the Gemini API/);
    expect(seen).toEqual([]);
    // Without a reference the agy fallback still applies.
    expect((await service.generateImage({ provider: 'gemini', model: 'gemini-2.5-flash-image', prompt: 'p', aspect: '1:1', signal })).ok).toBe(true);
    expect(seen[0]!.id).toBe('agy');
  });

  it('generate resolves reference paths through the media store and passes transparent through', async () => {
    const { service, seen } = setup();
    const base = { generationId: 'g', repoId: 'r', project: 'p', prompt: 'a fox', provider: 'gemini' as const, model: 'gemini-2.5-flash-image', aspect: '1:1' as const, count: 1 };
    expect((await service.generate({ ...base, references: ['sprite/characters/hero/reference/reference.png'], transparent: true })).ok).toBe(true);
    expect(seen[0]!.req.references![0]!.bytes.toString()).toBe('ref:sprite/characters/hero/reference/reference.png');
    expect(seen[0]!.req.transparent).toBe(true);
    expect(await service.generate({ ...base, generationId: 'g2', references: ['../../etc/passwd'] })).toEqual(failure('File not found.'));
  });
});
