import type { ModelOllamaModel, ModelProviders } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { framingFor, generateBlockedReason, modelFileUrl, mtlPathFor, pickOllamaModel, readImageAttachment, textModels, viewerFormat, visionModels } from './model-utils';

const model = (id: string, extra: Partial<ModelOllamaModel> = {}): ModelOllamaModel => ({ id, label: id, vision: false, embedding: false, ...extra });
const providers = (models: ModelOllamaModel[], available = true): ModelProviders => ({
  ollama: { available, ...(available ? {} : { reason: 'Ollama is not running.' }), models },
});

describe('files', () => {
  it('addresses a model inside the repo media folder', () => {
    expect(modelFileUrl('repo-1', 'robots', 'a b/robot.obj')).toBe(
      'mstudio-file://repo/repo-1/.midnite/media/model/robots/a%20b/robot.obj',
    );
  });

  it('finds the mtl beside an obj and the loader for a path', () => {
    expect(mtlPathFor('a/robot.obj')).toBe('a/robot.mtl');
    expect(viewerFormat('x.FBX')).toBe('fbx');
    expect(viewerFormat('x.json')).toBeNull();
  });
});

describe('framingFor', () => {
  const base = { size: [2, 2, 2] as const, center: [0, 1, 0] as const, fovDeg: 40, aspect: 1.5 };

  it('backs the camera off far enough to fit the bounding sphere', () => {
    const { distance, position } = framingFor(base);
    const radius = Math.hypot(2, 2, 2) / 2;
    expect(distance).toBeGreaterThan(radius / Math.sin((20 * Math.PI) / 180));
    expect(Math.hypot(position[0], position[1] - 1, position[2])).toBeCloseTo(distance, 6);
  });

  it('sits further back for a narrow pane than a wide one', () => {
    expect(framingFor({ ...base, aspect: 0.5 }).distance).toBeGreaterThan(framingFor({ ...base, aspect: 2 }).distance);
  });

  it('scales with the model and keeps the clip planes around it', () => {
    const small = framingFor({ ...base, size: [0.1, 0.1, 0.1] });
    const big = framingFor({ ...base, size: [100, 100, 100] });
    expect(big.distance / small.distance).toBeCloseTo(1000, 3);
    expect(small.near).toBeLessThan(small.distance);
    expect(small.far).toBeGreaterThan(small.distance);
  });

  it('survives an empty box', () => {
    const framing = framingFor({ ...base, size: [0, 0, 0] });
    expect(Number.isFinite(framing.distance)).toBe(true);
    expect(framing.distance).toBeGreaterThan(0);
  });
});

describe('model choice', () => {
  const installed = [model('llama3.2:3b'), model('nomic-embed-text', { embedding: true }), model('qwen2.5-coder:7b'), model('gemma3:4b', { vision: true })];

  it('lists text models with the suggested one first and embeddings out', () => {
    expect(textModels(installed).map((m) => m.id)).toEqual(['qwen2.5-coder:7b', 'llama3.2:3b', 'gemma3:4b']);
    expect(visionModels(installed).map((m) => m.id)).toEqual(['gemma3:4b']);
  });

  it('keeps the remembered model while it is installed, else the best installed, else the default', () => {
    expect(pickOllamaModel(installed, 'llama3.2:3b')).toBe('llama3.2:3b');
    expect(pickOllamaModel(installed, 'gone:1b')).toBe('qwen2.5-coder:7b');
    expect(pickOllamaModel([], 'gone:1b')).toBe('qwen2.5-coder:7b');
  });
});

describe('generateBlockedReason', () => {
  const ok = { prompt: 'a chair', image: null, running: false, engine: { id: 'ollama', model: 'm' }, providers: providers([model('qwen2.5-coder:7b')]) };
  const image = { name: 'a.png', mime: 'image/png' as const, data: 'AAAA' };

  it('allows a described model', () => {
    expect(generateBlockedReason(ok)).toBeUndefined();
  });

  it('needs a description or an image', () => {
    expect(generateBlockedReason({ ...ok, prompt: '  ' })).toMatch(/Describe/);
    expect(generateBlockedReason({ ...ok, prompt: '', image })).toBeUndefined();
  });

  it('blocks while running', () => {
    expect(generateBlockedReason({ ...ok, running: true })).toBe('Generating…');
  });

  it('explains a missing Ollama and an Ollama with nothing installed', () => {
    expect(generateBlockedReason({ ...ok, providers: providers([], false) })).toBe('Ollama is not running.');
    expect(generateBlockedReason({ ...ok, providers: providers([model('nomic-embed-text', { embedding: true })]) })).toMatch(/ollama pull qwen2.5-coder:7b/);
  });

  it('lets an agent engine run with Ollama down, unless an image needs it', () => {
    const agent = { ...ok, engine: { id: 'claude', model: 'default' }, providers: providers([], false) };
    expect(generateBlockedReason(agent)).toBeUndefined();
    expect(generateBlockedReason({ ...agent, image })).toMatch(/needs Ollama/);
  });

  it('waits for the provider probe rather than blocking on it', () => {
    expect(generateBlockedReason({ ...ok, providers: undefined })).toBeUndefined();
  });
});

describe('readImageAttachment', () => {
  it('base64-encodes a picked image', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 250])], 'fox.png', { type: 'image/png' });
    expect(await readImageAttachment(file)).toEqual({ ok: true, attachment: { name: 'fox.png', mime: 'image/png', data: 'AQID+g==' } });
  });

  it('refuses a non-image and an oversized image', async () => {
    expect(await readImageAttachment(new File(['x'], 'a.txt', { type: 'text/plain' }))).toMatchObject({ ok: false, error: expect.stringMatching(/PNG, JPEG/) });
    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    expect(await readImageAttachment(big)).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 8 MB/) });
  });
});
