import { describe, expect, it, vi } from 'vitest';

import { createMusicRuntime, createProgressAggregator, MODEL_DTYPE, modelCacheDir } from './runtime';

type Gen = (o: Record<string, unknown>) => Promise<{ data: Float32Array }>;

/** A stand-in for `@huggingface/transformers`' MusicGen surface; no weights, no ONNX. */
function fakeModule(generate: Gen, onLoad?: (cb: (e: unknown) => void) => void) {
  const env: { cacheDir?: string } = {};
  const from = vi.fn(async (_id: string, opts: { progress_callback: (e: unknown) => void }) => {
    onLoad?.(opts.progress_callback);
    return { generate, config: { audio_encoder: { sampling_rate: 32000 } } };
  });
  const module = {
    env,
    AutoTokenizer: { from_pretrained: vi.fn(async () => (text: string) => ({ input_ids: text })) },
    MusicgenForConditionalGeneration: { from_pretrained: from },
  };
  return { module: module as never, env, from };
}

const never = () => false;

describe('progress aggregator', () => {
  it('folds per-file events into one capped fraction', () => {
    const fold = createProgressAggregator();
    expect(fold({ status: 'progress', file: 'a', loaded: 100_000_000, total: 200_000_000 })).toBeCloseTo(100 / 660, 2);
    expect(fold({ status: 'progress', file: 'b', loaded: 50_000_000, total: 50_000_000 })).toBeCloseTo(150 / 660, 2);
    expect(fold({ status: 'done', file: 'a' })).toBeCloseTo(250 / 660, 2);
    expect(fold({ status: 'progress', file: 'c', loaded: 9e9, total: 9e9 })).toBe(0.99);
    expect(fold({ status: 'initiate' })).toBe(0.99);
  });
});

describe('music runtime', () => {
  it('reports missing until the required files exist, and unavailable after a native failure', async () => {
    const present = new Set<string>();
    const { module } = fakeModule(async () => ({ data: new Float32Array(1) }));
    const rt = createMusicRuntime({ loadModule: async () => module, directory: '/u', exists: (p) => present.has(p) });
    expect(rt.status()).toEqual({ state: 'missing' });

    const bad = createMusicRuntime({
      loadModule: async () => Promise.reject(new Error("Cannot find module 'onnxruntime-node'")),
      directory: '/u',
    });
    await expect(bad.install(() => undefined)).rejects.toThrow('onnxruntime');
    expect(bad.status()).toMatchObject({ state: 'unavailable' });
  });

  it('points the cache under userData, loads with the documented dtypes and shares one install', async () => {
    const { module, env, from } = fakeModule(async () => ({ data: new Float32Array(1) }), (cb) =>
      cb({ status: 'progress', file: 'onnx/x', loaded: 66_000_000, total: 66_000_000 }),
    );
    const rt = createMusicRuntime({ loadModule: async () => module, directory: '/u', exists: () => true });
    const events: string[] = [];
    await Promise.all([rt.install((p) => events.push(p.phase)), rt.install((p) => events.push(p.phase))]);

    expect(env.cacheDir).toBe(modelCacheDir('/u'));
    expect(from).toHaveBeenCalledTimes(1);
    expect(from.mock.calls[0]![1]).toMatchObject({ dtype: MODEL_DTYPE, device: 'cpu' });
    expect(events).toContain('ready');
    expect(rt.status()).toEqual({ state: 'ready' });
  });

  it('retries a failed (offline) install instead of staying broken', async () => {
    const good = fakeModule(async () => ({ data: new Float32Array(1) }));
    const loadModule = vi.fn().mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(good.module);
    const rt = createMusicRuntime({ loadModule, directory: '/u', exists: () => false });
    await expect(rt.install(() => undefined)).rejects.toThrow('fetch failed');
    expect(rt.status().state).toBe('missing');
    await expect(rt.install(() => undefined)).resolves.toBeUndefined();
  });

  it('renders at 50 tokens per second with guidance and returns samples at the model rate', async () => {
    const generate = vi.fn<Gen>(async (o) => {
      const s = o.streamer as { put: () => void };
      for (let i = 0; i < 100; i += 1) s.put();
      return { data: Float32Array.from([0.1, -0.2]) };
    });
    const { module } = fakeModule(generate);
    const rt = createMusicRuntime({ loadModule: async () => module, directory: '/u', exists: () => true });
    const progress: number[] = [];
    const out = await rt.render({ prompt: 'lofi', seconds: 2 }, { isCancelled: never, onProgress: (f) => progress.push(f) });

    expect(generate.mock.calls[0]![0]).toMatchObject({ input_ids: 'lofi', max_new_tokens: 100, do_sample: true, guidance_scale: 3 });
    expect(out.sampleRate).toBe(32000);
    expect(Array.from(out.samples)).toEqual([expect.closeTo(0.1), expect.closeTo(-0.2)]);
    expect(progress.at(-1)).toBe(1);
  });

  it('aborts mid-render through the streamer and surfaces "cancelled"', async () => {
    let cancelled = false;
    const generate: Gen = async (o) => {
      const s = o.streamer as { put: () => void };
      for (let i = 0; i < 50; i += 1) {
        if (i === 5) cancelled = true;
        s.put();
      }
      return { data: new Float32Array(1) };
    };
    const { module } = fakeModule(generate);
    const rt = createMusicRuntime({ loadModule: async () => module, directory: '/u', exists: () => true });
    await expect(rt.render({ prompt: 'x', seconds: 1 }, { isCancelled: () => cancelled, onProgress: () => undefined })).rejects.toThrow('cancelled');
  });
});
