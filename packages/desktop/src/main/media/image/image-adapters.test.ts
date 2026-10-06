import { describe, expect, it, vi } from 'vitest';

import { agyArgs, agyImagePrompt, createAgyImageProvider } from './agy';
import {
  GEMINI_API_BASE,
  geminiGenerateContentBody,
  geminiImageProvider,
  imagenPredictBody,
  parseGenerateContent,
  parsePredict,
} from './gemini';
import { createOllamaImageProvider, imageCapableModels, ollamaImageRequestBody, parseOllamaImage } from './ollama';
import { OPENAI_IMAGES_URL, openaiImageProvider, openaiRequestBody } from './openai';

/** No network anywhere in here: every adapter gets a fake `fetch`. */
const PNG_B64 = Buffer.from('fake-png').toString('base64');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deps = (fetchImpl: typeof fetch, apiKey: string | null = 'k-test') => ({
  fetch: fetchImpl,
  apiKey,
  signal: new AbortController().signal,
  onImage: vi.fn(),
});
const call = (fetchMock: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
};

describe('gemini adapter', () => {
  it('builds a generateContent body asking for IMAGE output at the aspect', () => {
    expect(geminiGenerateContentBody('a fox', '16:9', 7)).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'a fox' }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' }, seed: 7 },
    });
  });

  it('maps 3:2 to Imagen 4:3 and carries sampleCount', () => {
    expect(imagenPredictBody('a fox', '3:2', 3)).toEqual({
      instances: [{ prompt: 'a fox' }],
      parameters: { sampleCount: 3, aspectRatio: '4:3' },
    });
  });

  it('reads inlineData parts and names a block reason when there are none', () => {
    const [image] = parseGenerateContent({
      candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }],
    });
    expect(image!.bytes.toString()).toBe('fake-png');
    expect(() => parseGenerateContent({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/SAFETY/);
    expect(() => parsePredict({ predictions: [] })).toThrow(/no image/);
  });

  it('sends the key as x-goog-api-key, one generateContent call per image', async () => {
    const fetchMock = vi.fn(async () =>
      json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }] }),
    );
    const d = deps(fetchMock as unknown as typeof fetch);
    const images = await geminiImageProvider.generate(
      { prompt: 'p', model: 'gemini-2.5-flash-image', aspect: '1:1', count: 2, seed: 10 },
      d,
    );
    expect(images).toHaveLength(2);
    expect(d.onImage).toHaveBeenCalledTimes(2);
    const first = call(fetchMock);
    expect(first.url).toBe(`${GEMINI_API_BASE}/models/gemini-2.5-flash-image:generateContent`);
    expect((first.init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-test');
    expect((call(fetchMock, 1).body.generationConfig as { seed: number }).seed).toBe(11);
  });

  it('routes imagen models to :predict in one call', async () => {
    const fetchMock = vi.fn(async () =>
      json({ predictions: [{ bytesBase64Encoded: PNG_B64 }, { bytesBase64Encoded: PNG_B64 }] }),
    );
    const images = await geminiImageProvider.generate(
      { prompt: 'p', model: 'imagen-4.0-generate-001', aspect: '9:16', count: 2 },
      deps(fetchMock as unknown as typeof fetch),
    );
    expect(images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(call(fetchMock).url).toMatch(/imagen-4\.0-generate-001:predict$/);
  });

  it('surfaces an API error message and refuses without a key', async () => {
    const fetchMock = vi.fn(async () => json({ error: { message: 'API key not valid' } }, 400));
    await expect(
      geminiImageProvider.generate(
        { prompt: 'p', model: 'gemini-2.5-flash-image', aspect: '1:1', count: 1 },
        deps(fetchMock as unknown as typeof fetch),
      ),
    ).rejects.toThrow('Gemini returned 400: API key not valid');
    await expect(
      geminiImageProvider.generate(
        { prompt: 'p', model: 'gemini-2.5-flash-image', aspect: '1:1', count: 1 },
        deps(fetchMock as unknown as typeof fetch, null),
      ),
    ).rejects.toThrow(/Add a Gemini API key/);
  });
});

describe('openai adapter', () => {
  it('maps aspect to the nearest gpt-image size and passes n', () => {
    expect(openaiRequestBody('p', 'gpt-image-1', '16:9', 3)).toEqual({
      model: 'gpt-image-1',
      prompt: 'p',
      n: 3,
      size: '1536x1024',
      output_format: 'png',
    });
    expect(openaiRequestBody('p', 'gpt-image-1', '2:3', 1).size).toBe('1024x1536');
  });

  it('asks for a transparent background only when the request does', () => {
    expect(openaiRequestBody('p', 'gpt-image-1', '1:1', 1)).not.toHaveProperty('background');
    expect(openaiRequestBody('p', 'gpt-image-1', '1:1', 1, true)).toMatchObject({ background: 'transparent', output_format: 'png' });
  });

  it('sends a bearer key and reads data[].b64_json', async () => {
    const fetchMock = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }));
    const images = await openaiImageProvider.generate(
      { prompt: 'p', model: 'gpt-image-1', aspect: '1:1', count: 1 },
      deps(fetchMock as unknown as typeof fetch),
    );
    expect(images[0]!.mime).toBe('image/png');
    const sent = call(fetchMock);
    expect(sent.url).toBe(OPENAI_IMAGES_URL);
    expect((sent.init.headers as Record<string, string>).authorization).toBe('Bearer k-test');
  });
});

describe('ollama adapter', () => {
  it('only offers models whose capabilities include image', () => {
    expect(
      imageCapableModels([
        { name: 'llama3', capabilities: ['completion'] },
        { name: 'x/z-image-turbo', capabilities: ['image'] },
      ]),
    ).toEqual([{ id: 'x/z-image-turbo', label: 'x/z-image-turbo' }]);
  });

  it('posts a non-streaming /api/generate with dimensions and reads image or images[]', async () => {
    expect(ollamaImageRequestBody('m', 'p', '16:9', 3)).toEqual({
      model: 'm',
      prompt: 'p',
      stream: false,
      width: 1344,
      height: 768,
      options: { seed: 3 },
    });
    expect(parseOllamaImage({ images: [PNG_B64] }).bytes.toString()).toBe('fake-png');
    expect(() => parseOllamaImage({})).toThrow(/no image/);

    const fetchMock = vi.fn(async () => json({ image: PNG_B64 }));
    const provider = createOllamaImageProvider(async () => 'http://127.0.0.1:11434');
    await provider.generate({ prompt: 'p', model: 'm', aspect: '1:1', count: 1 }, deps(fetchMock as unknown as typeof fetch, null));
    expect(call(fetchMock).url).toBe('http://127.0.0.1:11434/api/generate');
  });
});

describe('agy adapter', () => {
  it('builds a print-mode invocation asking for a file in the cwd', () => {
    expect(agyArgs('x')).toEqual(['-p', 'x', '--mode', 'accept-edits']);
    expect(agyImagePrompt('a fox', '16:9', 'image.png')).toMatch(/a fox[\s\S]*16:9[\s\S]*image\.png/);
  });

  it('reads back the image the CLI wrote into its working directory', async () => {
    const run = vi.fn(async (_args: string[], { cwd }: { cwd: string }) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(`${cwd}/image.png`, 'bytes');
    });
    const d = deps(vi.fn(), null);
    const images = await createAgyImageProvider(run).generate({ prompt: 'p', model: 'agy-default', aspect: '1:1', count: 2 }, d);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ mime: 'image/png' });
    expect(images[0]!.bytes.toString()).toBe('bytes');
    expect(d.onImage).toHaveBeenCalledTimes(2);
  });

  it('reports a clear error when the CLI produced no image', async () => {
    await expect(
      createAgyImageProvider(async () => undefined).generate({ prompt: 'p', model: 'm', aspect: '1:1', count: 1 }, deps(vi.fn(), null)),
    ).rejects.toThrow(/without producing an image/);
  });
});
