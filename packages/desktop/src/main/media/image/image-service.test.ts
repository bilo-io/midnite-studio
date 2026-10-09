import { ok, parseImageSidecar, type ImageGenerateProgressEvent, type ImageProviderId } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createImageService, imageFileName, promptSlug, timeStamp } from './image-service';
import type { ImageProvider } from './types';

const fakeProvider = (id: ImageProviderId, impl?: ImageProvider['generate']): ImageProvider => ({
  id,
  generate:
    impl ??
    (async (req, deps) => {
      const images = Array.from({ length: req.count }, () => ({ bytes: Buffer.from('px'), mime: 'image/png' }));
      images.forEach((image) => deps.onImage?.(image));
      return images;
    }),
});

function setup(overrides: { keys?: Record<string, string>; provider?: ImageProvider['generate']; agy?: boolean } = {}) {
  const writes: { path: string; content: string; encoding: string }[] = [];
  const events: ImageGenerateProgressEvent[] = [];
  const service = createImageService({
    providers: {
      gemini: fakeProvider('gemini', overrides.provider),
      openai: fakeProvider('openai'),
      agy: fakeProvider('agy'),
      ollama: fakeProvider('ollama'),
    },
    readKey: async (key) => overrides.keys?.[key] ?? null,
    writeFile: async (req) => {
      writes.push(req);
      return ok({ size: 1, largeFile: false });
    },
    emit: (event) => events.push(event),
    fetch: vi.fn() as unknown as typeof fetch,
    discoverOllamaModels: async () => [],
    agyAvailable: async () => overrides.agy ?? false,
    now: () => new Date(2026, 8, 30, 14, 15, 2),
  });
  return { service, writes, events };
}

const request = {
  generationId: 'g1',
  repoId: 'r',
  project: 'launch',
  prompt: 'A red fox, at dusk!',
  provider: 'gemini' as const,
  model: 'gemini-2.5-flash-image',
  aspect: '1:1' as const,
  count: 2,
  seed: 5,
};

describe('image service', () => {
  it('names files from the prompt and time', () => {
    expect(promptSlug('A red fox, at dusk!')).toBe('a-red-fox-at-dusk');
    expect(promptSlug('!!!')).toBe('image');
    expect(timeStamp(new Date(2026, 8, 30, 14, 15, 2))).toBe('20260930-141502');
    expect(imageFileName('b', 0, 1, 'image/jpeg')).toBe('b.jpg');
    expect(imageFileName('b', 1, 3, 'image/png')).toBe('b-2.png');
  });

  it('fails with a clear result (never a throw) when there is neither a key nor agy', async () => {
    const { service } = setup();
    expect(await service.generate(request)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/No Gemini API key.*Antigravity CLI/),
    });
    expect(await service.generate({ ...request, provider: 'agy', model: 'agy-default' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/install the Antigravity CLI/),
    });
  });

  it('routes a keyless request through agy when the CLI exists, recording agy in the sidecar', async () => {
    const used: string[] = [];
    const { writes } = setup({ agy: true });
    const probe = createImageService({
      providers: {
        gemini: fakeProvider('gemini', async () => {
          used.push('gemini');
          return [];
        }),
        openai: fakeProvider('openai'),
        agy: fakeProvider('agy', async (req, deps) => {
          used.push(`agy:${req.model}`);
          deps.onImage?.({ bytes: Buffer.from('px'), mime: 'image/png' });
          return [];
        }),
        ollama: fakeProvider('ollama'),
      },
      readKey: async () => null,
      writeFile: async (req) => {
        writes.push(req);
        return ok({ size: 1, largeFile: false });
      },
      emit: () => undefined,
      fetch: vi.fn() as unknown as typeof fetch,
      discoverOllamaModels: async () => [],
      agyAvailable: async () => true,
    });
    const result = await probe.generate({ ...request, count: 1 });
    expect(result.ok).toBe(true);
    expect(used).toEqual(['agy:agy-default']);
    const sidecar = parseImageSidecar(writes.find((w) => w.path.endsWith('.json'))!.content);
    expect(sidecar).toMatchObject({ provider: 'agy', model: 'agy-default' });
  });

  it('writes each image as base64 plus a parseable sidecar, streaming progress', async () => {
    const { service, writes, events } = setup({ keys: { 'media.geminiApiKey': 'k' } });
    const result = await service.generate(request);
    expect(result).toEqual({
      ok: true,
      value: { files: ['a-red-fox-at-dusk-20260930-141502-1.png', 'a-red-fox-at-dusk-20260930-141502-2.png'] },
    });
    expect(writes.map((w) => [w.path, w.encoding])).toEqual([
      ['a-red-fox-at-dusk-20260930-141502-1.png', 'base64'],
      ['a-red-fox-at-dusk-20260930-141502-1.json', 'utf8'],
      ['a-red-fox-at-dusk-20260930-141502-2.png', 'base64'],
      ['a-red-fox-at-dusk-20260930-141502-2.json', 'utf8'],
    ]);
    const sidecar = parseImageSidecar(writes[3]!.content);
    expect(sidecar).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash-image', seed: 6, prompt: request.prompt });
    expect(events.map((e) => [e.status, e.completed])).toEqual([
      ['running', 0],
      ['running', 1],
      ['running', 2],
      ['succeeded', 2],
    ]);
  });

  it('reports a provider failure and a cancel distinctly', async () => {
    const failing = setup({
      keys: { 'media.geminiApiKey': 'k' },
      provider: async () => {
        throw new Error('quota exceeded');
      },
    });
    expect(await failing.service.generate(request)).toMatchObject({ ok: false, message: 'quota exceeded' });
    expect(failing.events.at(-1)).toMatchObject({ status: 'failed', error: 'quota exceeded' });

    const slow = setup({
      keys: { 'media.geminiApiKey': 'k' },
      provider: (_req, deps) =>
        new Promise((_resolve, reject) => deps.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    const pending = slow.service.generate(request);
    await Promise.resolve();
    await Promise.resolve();
    expect(slow.service.cancel('g1')).toEqual({ ok: true });
    expect(await pending).toMatchObject({ ok: false, message: 'cancelled' });
    expect(slow.events.at(-1)?.status).toBe('cancelled');
  });

  it('reports provider availability: key, disabled, and ollama discovery', async () => {
    const { service } = setup({ keys: { 'media.openaiApiKey': 'k' } });
    const statuses = await service.providerStatuses();
    expect(statuses.map((s) => [s.id, s.available, s.missingKey])).toEqual([
      ['gemini', false, true],
      ['openai', true, false],
      ['agy', false, false],
      ['ollama', false, false],
    ]);
    // With agy installed a missing key no longer blocks Generate.
    const withAgy = await setup({ agy: true }).service.providerStatuses();
    expect(withAgy.map((s) => [s.id, s.available, s.missingKey])).toEqual([
      ['gemini', true, true],
      ['openai', true, true],
      ['agy', true, false],
      ['ollama', false, false],
    ]);
  });
});
