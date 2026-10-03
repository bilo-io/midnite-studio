import type { GitOpResult, ModelGenerateProgressEvent, ModelGenerateRequest } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';
import { ModelSpecSchema } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createDescribeImage, createLlmCall, discoverVisionModels, probeProviders, type OllamaSeam } from './engines';
import { createModelService, MODEL_MAX_REPAIRS, modelSlug, modelTimeStamp, type ModelServiceDeps } from './model-service';

const GOOD = JSON.stringify({
  name: 'Red Mug',
  parts: [
    { name: 'body', shape: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.09, position: [0, 0.045, 0], color: '#cc3333' },
    { name: 'handle', shape: 'torus', radius: 0.03, tube: 0.008, position: [0.05, 0.045, 0], color: '#cc3333' },
  ],
});

const request = (overrides: Partial<ModelGenerateRequest> = {}): ModelGenerateRequest => ({
  generationId: 'g1',
  repoId: 'r1',
  project: 'mugs',
  prompt: 'a red mug',
  engine: { kind: 'ollama', model: 'qwen2.5-coder:7b' },
  ...overrides,
});

function harness(llmReplies: (GitOpResult<{ text: string }> | string)[], overrides: Partial<ModelServiceDeps> = {}) {
  const written = new Map<string, Buffer>();
  const events: ModelGenerateProgressEvent[] = [];
  const replies = [...llmReplies];
  const llm = vi.fn(async () => {
    const next = replies.shift() ?? GOOD;
    return typeof next === 'string' ? ok({ text: next }) : next;
  });
  const deps: ModelServiceDeps = {
    llm,
    describeImage: vi.fn(async () => ok({ text: 'a red mug with a handle', model: 'qwen2.5vl:7b' })),
    writeBytes: async ({ path, data }) => {
      written.set(path, data);
      return ok({ size: data.length });
    },
    readBytes: async ({ path }) => (written.has(path) ? ok(written.get(path)!) : failure('File not found.')),
    emit: (event) => events.push(event),
    now: () => new Date(2026, 9, 3, 14, 15, 2),
    ...overrides,
  };
  return { service: createModelService(deps), written, events, llm, deps };
}

describe('model service', () => {
  it('writes the obj, mtl, fbx and sidecar and reports them', async () => {
    const { service, written, events } = harness([GOOD]);
    const result = await service.generate(request());
    expect(result).toEqual({
      ok: true,
      value: {
        primary: 'red-mug-20261003-141502.obj',
        files: ['red-mug-20261003-141502.json', 'red-mug-20261003-141502.mtl', 'red-mug-20261003-141502.obj', 'red-mug-20261003-141502.fbx'],
      },
    });
    expect(written.get('red-mug-20261003-141502.obj')!.toString()).toContain('mtllib red-mug-20261003-141502.mtl');
    expect(written.get('red-mug-20261003-141502.fbx')!.subarray(0, 18).toString('latin1')).toBe('Kaydara FBX Binary');
    const sidecar = JSON.parse(written.get('red-mug-20261003-141502.json')!.toString());
    expect(sidecar).toMatchObject({ version: 1, prompt: 'a red mug', engine: 'ollama:qwen2.5-coder:7b' });
    expect(sidecar.spec.parts).toHaveLength(2);
    expect(events.map((e) => e.stage ?? e.status)).toEqual(['generating', 'building', 'writing', 'succeeded']);
  });

  it('describes an attached image first and feeds it to the engine', async () => {
    const { service, llm, deps, events } = harness([GOOD]);
    const result = await service.generate(request({ prompt: '', image: { name: 'mug.png', mime: 'image/png', data: 'AAAA' }, visionModel: 'gemma3:4b' }));
    expect(result.ok).toBe(true);
    expect(deps.describeImage).toHaveBeenCalledWith(expect.objectContaining({ visionModel: 'gemma3:4b' }));
    const prompt = (llm.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt;
    expect(prompt).toContain('a red mug with a handle');
    expect(events[0]!.stage).toBe('describing');
  });

  it('repairs an invalid reply with the validation errors, then succeeds', async () => {
    const { service, llm, events } = harness(['{"parts":[{"shape":"teapot"}]}', GOOD]);
    const result = await service.generate(request());
    expect(result.ok).toBe(true);
    expect(llm).toHaveBeenCalledTimes(2);
    expect((llm.mock.calls[1] as unknown as [{ prompt: string }])[0].prompt).toContain('could not be used');
    expect(events.some((e) => e.stage === 'repairing')).toBe(true);
  });

  it('gives up after the repair budget and says what was wrong', async () => {
    const { service, llm, written, events } = harness(Array.from({ length: 5 }, () => 'not json at all'));
    const result = await service.generate(request());
    expect(llm).toHaveBeenCalledTimes(MODEL_MAX_REPAIRS + 1);
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect((result as { message: string }).message).toContain('no JSON');
    expect(written.size).toBe(0);
    expect(events.at(-1)).toMatchObject({ status: 'failed' });
  });

  it('surfaces an engine failure verbatim', async () => {
    const { service } = harness([failure('Could not reach Ollama: connect ECONNREFUSED')]);
    expect(await service.generate(request())).toMatchObject({ ok: false, message: 'Could not reach Ollama: connect ECONNREFUSED' });
  });

  it('stops before the engine when the image cannot be read', async () => {
    const { service, llm } = harness([], { describeImage: async () => failure('No Ollama vision model is installed.') });
    const result = await service.generate(request({ image: { name: 'a.png', mime: 'image/png', data: 'AAAA' } }));
    expect(result).toMatchObject({ ok: false, message: 'No Ollama vision model is installed.' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('cancels a run in flight', async () => {
    let release!: () => void;
    const { service, events, written } = harness([], {
      llm: (call) =>
        new Promise((resolve) => {
          release = () => resolve(ok({ text: GOOD }));
          call.signal.addEventListener('abort', () => release());
        }),
    });
    const running = service.generate(request());
    await Promise.resolve();
    expect(service.cancel('g1')).toEqual({ ok: true, value: undefined });
    expect(await running).toMatchObject({ ok: false, message: 'cancelled' });
    expect(events.at(-1)!.status).toBe('cancelled');
    expect(written.size).toBe(0);
    expect(service.cancel('g1')).toMatchObject({ ok: false });
  });

  it('refuses a second run under the same id', async () => {
    let release!: () => void;
    const { service } = harness([], {
      llm: () => new Promise((resolve) => (release = () => resolve(ok({ text: GOOD })))),
    });
    const first = service.generate(request());
    await Promise.resolve();
    expect(await service.generate(request())).toMatchObject({ ok: false, message: 'This generation is already running.' });
    release();
    await first;
  });

  it('reports a write failure instead of claiming success', async () => {
    const { service, events } = harness([GOOD], { writeBytes: async () => failure('Path is not allowed.') });
    expect(await service.generate(request())).toMatchObject({ ok: false, message: 'Path is not allowed.' });
    expect(events.at(-1)!.status).toBe('failed');
  });

  it('falls back to the prompt for the file name when the design is unnamed', async () => {
    const unnamed = JSON.stringify({ parts: [{ shape: 'sphere', radius: 1 }] });
    const { service } = harness([unnamed]);
    const result = await service.generate(request({ prompt: 'A big ball!' }));
    expect(result).toMatchObject({ ok: true, value: { primary: 'a-big-ball-20261003-141502.obj' } });
  });

  describe('save as', () => {
    it('rebuilds either format from the sidecar spec, with the mtl riding along', async () => {
      const { service } = harness([GOOD]);
      await service.generate(request());
      const obj = await service.exportBytes({ repoId: 'r1', project: 'mugs', path: 'red-mug-20261003-141502.fbx', format: 'obj' });
      expect(obj).toMatchObject({ ok: true, value: { fileName: 'red-mug-20261003-141502.obj' } });
      if (obj.ok) {
        expect(obj.value.extras.map((e) => e.fileName)).toEqual(['red-mug-20261003-141502.mtl']);
        expect(obj.value.data.toString()).toContain('o body');
      }
      const fbx = await service.exportBytes({ repoId: 'r1', project: 'mugs', path: 'red-mug-20261003-141502.obj', format: 'fbx' });
      expect(fbx).toMatchObject({ ok: true, value: { fileName: 'red-mug-20261003-141502.fbx', extras: [] } });
    });

    it('exports unsaved edits instead of the saved design', async () => {
      const { service } = harness([GOOD]);
      await service.generate(request());
      const edited = ModelSpecSchema.parse({ name: 'edited', parts: [{ name: 'only', shape: 'sphere', radius: 2 }] });
      const obj = await service.exportBytes({ repoId: 'r1', project: 'mugs', path: 'red-mug-20261003-141502.obj', format: 'obj', spec: edited });
      expect(obj.ok && obj.value.data.toString()).toContain('o only');
      expect(obj.ok && obj.value.data.toString()).not.toContain('o body');
    });

    it('copies a hand-added file in its own format and refuses a conversion it cannot do', async () => {
      const { service, written } = harness([]);
      written.set('stray.obj', Buffer.from('v 0 0 0\n'));
      expect(await service.exportBytes({ repoId: 'r1', project: 'p', path: 'stray.obj', format: 'obj' })).toMatchObject({
        ok: true,
        value: { fileName: 'stray.obj' },
      });
      expect(await service.exportBytes({ repoId: 'r1', project: 'p', path: 'stray.obj', format: 'fbx' })).toMatchObject({
        ok: false,
        message: expect.stringContaining('no saved design'),
      });
    });
  });
});

describe('save edit', () => {
  const edited = ModelSpecSchema.parse({ name: 'Red Mug', parts: [{ name: 'lid', shape: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.01, color: '#112233' }] });

  it('rewrites the sidecar spec and the whole trio under the same names, keeping the prompt', async () => {
    const { service, written } = harness([GOOD]);
    const made = await service.generate(request());
    const stem = made.ok ? made.value.primary.replace(/\.obj$/, '') : '';
    const result = await service.saveEdit({ repoId: 'r1', project: 'mugs', path: `${stem}.fbx`, spec: edited });
    expect(result).toEqual({ ok: true, value: { files: [`${stem}.json`, `${stem}.mtl`, `${stem}.obj`, `${stem}.fbx`] } });
    const sidecar = JSON.parse(written.get(`${stem}.json`)!.toString());
    expect(sidecar.prompt).toBe('a red mug');
    expect(sidecar.spec.parts).toHaveLength(1);
    expect(written.get(`${stem}.obj`)!.toString()).toContain('o lid');
    expect(written.get(`${stem}.obj`)!.toString()).toContain(`mtllib ${stem}.mtl`);
    expect(written.get(`${stem}.mtl`)!.toString()).toContain('Kd 0.066667 0.133333 0.2');
  });

  it('refuses a file with no saved design', async () => {
    const { service, written } = harness([]);
    written.set('stray.obj', Buffer.from('v 0 0 0'));
    expect(await service.saveEdit({ repoId: 'r1', project: 'p', path: 'stray.obj', spec: edited })).toMatchObject({
      ok: false,
      message: expect.stringContaining('no saved design'),
    });
  });

  it('reports a write failure', async () => {
    const { service } = harness([GOOD]);
    const made = await service.generate(request());
    const stem = made.ok ? made.value.primary.replace(/\.obj$/, '') : '';
    const failing = harness([], {
      readBytes: async () => ok(Buffer.from(JSON.stringify({ version: 1, name: stem, prompt: '', engine: 'x', spec: edited, createdAt: 'x' }))),
      writeBytes: async () => failure('Path is not allowed.'),
    });
    expect(await failing.service.saveEdit({ repoId: 'r1', project: 'mugs', path: `${stem}.obj`, spec: edited })).toMatchObject({ ok: false, message: 'Path is not allowed.' });
  });
});

describe('file names', () => {
  it('slugs and stamps', () => {
    expect(modelSlug('A red fox, at dusk!')).toBe('a-red-fox-at-dusk');
    expect(modelSlug('***')).toBe('model');
    expect(modelTimeStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405');
  });
});

function seam(overrides: Partial<OllamaSeam> = {}): OllamaSeam {
  return {
    chat: vi.fn(async () => 'reply'),
    tags: vi.fn(async () => [{ name: 'llama3.2:3b' }, { name: 'gemma3:4b' }, { name: 'qwen2.5vl:7b' }, { name: 'nomic-embed-text' }]),
    capabilities: vi.fn(async (model: string) =>
      model.includes('gemma3') || model.includes('vl') ? ['completion', 'vision'] : model.includes('embed') ? ['embedding'] : ['completion'],
    ),
    ...overrides,
  };
}

describe('engines', () => {
  const signal = new AbortController().signal;

  it('asks Ollama for JSON, low temperature, a roomy context', async () => {
    const ollama = seam();
    const llm = createLlmCall({ ollama, runAgent: vi.fn() });
    expect(await llm({ engine: { kind: 'ollama', model: 'qwen2.5-coder:7b' }, repoId: 'r', prompt: 'p', signal, json: true })).toEqual(ok({ text: 'reply' }));
    expect(ollama.chat).toHaveBeenCalledWith(
      { model: 'qwen2.5-coder:7b', messages: [{ role: 'user', content: 'p' }], format: 'json', options: { temperature: 0.3, num_ctx: 8192 } },
      expect.objectContaining({ signal }),
    );
  });

  it('routes an agent engine through the headless runner', async () => {
    const runAgent = vi.fn(async () => ok({ text: '{}' }));
    const llm = createLlmCall({ ollama: seam(), runAgent });
    await llm({ engine: { kind: 'agent', agentId: 'claude' }, repoId: 'r1', prompt: 'p', signal, json: true });
    expect(runAgent).toHaveBeenCalledWith({ agentId: 'claude', model: undefined, repoId: 'r1', prompt: 'p' });
  });

  it('says how to start Ollama when the daemon is down', async () => {
    const ollama = seam({ chat: async () => Promise.reject(new Error('fetch failed')) });
    const result = await createLlmCall({ ollama, runAgent: vi.fn() })({ engine: { kind: 'ollama', model: 'm' }, repoId: 'r', prompt: 'p', signal, json: true });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('ollama serve') });
  });

  it('reads an abort as a cancel, and a timeout as a hint to go smaller', async () => {
    const llm = (error: Error) => createLlmCall({ ollama: seam({ chat: async () => Promise.reject(error) }), runAgent: vi.fn() });
    const call = { engine: { kind: 'ollama' as const, model: 'm' }, repoId: 'r', prompt: 'p', signal, json: true };
    expect(await llm(new Error('Ollama request cancelled.'))(call)).toMatchObject({ message: 'cancelled' });
    expect(await llm(new Error('Ollama request to x timed out after 1 ms.'))(call)).toMatchObject({ message: expect.stringContaining('smaller model') });
  });

  it('ranks installed vision models with the suggested one first', async () => {
    expect(await discoverVisionModels(seam())).toEqual(['qwen2.5vl:7b', 'gemma3:4b']);
  });

  it('describes with the discovered vision model, sending the image', async () => {
    const ollama = seam({ chat: vi.fn(async () => '  a red mug  ') });
    const describe = createDescribeImage({ ollama, runAgent: vi.fn() });
    expect(await describe({ image: { name: 'm.png', mime: 'image/png', data: 'AAAA' }, visionModel: undefined, signal })).toEqual(
      ok({ text: 'a red mug', model: 'qwen2.5vl:7b' }),
    );
    expect(ollama.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen2.5vl:7b', messages: [expect.objectContaining({ images: ['AAAA'] })] }),
      expect.anything(),
    );
  });

  it('tells the user which model to pull when none has vision', async () => {
    const ollama = seam({ tags: async () => [{ name: 'llama3.2:3b' }] });
    const result = await createDescribeImage({ ollama, runAgent: vi.fn() })({ image: { name: 'a.png', mime: 'image/png', data: 'A' }, visionModel: undefined, signal });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('ollama pull qwen2.5vl:7b') });
  });

  it('names the pull command when the chosen vision model is missing', async () => {
    const ollama = seam({ chat: async () => Promise.reject(new Error('Ollama /api/chat returned 404 for "llava:7b".')) });
    const result = await createDescribeImage({ ollama, runAgent: vi.fn() })({ image: { name: 'a.png', mime: 'image/png', data: 'A' }, visionModel: 'llava:7b', signal });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('ollama pull llava:7b') });
  });

  it('probes the installed models and their capabilities', async () => {
    const status = await probeProviders(seam());
    expect(status.ollama.available).toBe(true);
    expect(status.ollama.models).toEqual([
      { id: 'llama3.2:3b', label: 'llama3.2:3b', vision: false, embedding: false },
      { id: 'gemma3:4b', label: 'gemma3:4b', vision: true, embedding: false },
      { id: 'qwen2.5vl:7b', label: 'qwen2.5vl:7b', vision: true, embedding: false },
      { id: 'nomic-embed-text', label: 'nomic-embed-text', vision: false, embedding: true },
    ]);
  });

  it('degrades to an explanation when Ollama is not running', async () => {
    const status = await probeProviders(seam({ tags: async () => Promise.reject(new Error('ECONNREFUSED')) }));
    expect(status.ollama).toMatchObject({ available: false, models: [], reason: expect.stringContaining('ollama serve') });
  });
});
