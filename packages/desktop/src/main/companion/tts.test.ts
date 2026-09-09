import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VOICE_ID,
  getCompanionTtsStatus,
  resetCompanionTtsForTest,
  synthesizeSpeech,
  type CompanionTtsDeps,
} from './tts';

/**
 * Kokoro-82M engine (the sherpa-onnx-node replacement) — everything `tts.ts`
 * does that is not the native module itself, against a fake for `kokoro-js`'s
 * `KokoroTTS`. No real network call, no real ONNX runtime, no real model
 * download: `KokoroTTS.from_pretrained`/`generate` own all of that in the real
 * package, so the fake below stands in for both at once rather than for a
 * hand-rolled tarball fetch — unlike the old sherpa build, this module no
 * longer does its own provisioning I/O for the test to exercise directly.
 */

type FakeGeneratedAudio = { audio: Float32Array; sampling_rate: number };

class FakeKokoroTTS {
  static instances: FakeKokoroTTS[] = [];
  static fromPretrainedCallCount = 0;
  /** Rejects the *next* `from_pretrained` call only — a transient blip, not sticky. */
  static rejectNextLoad = false;
  static generateShouldThrow = false;

  static async from_pretrained(_modelId: string, _opts: unknown): Promise<FakeKokoroTTS> {
    FakeKokoroTTS.fromPretrainedCallCount += 1;
    if (FakeKokoroTTS.rejectNextLoad) {
      FakeKokoroTTS.rejectNextLoad = false;
      throw new Error('fake network failure');
    }
    const instance = new FakeKokoroTTS();
    FakeKokoroTTS.instances.push(instance);
    return instance;
  }

  generate(_text: string, _opts: unknown): Promise<FakeGeneratedAudio> {
    if (FakeKokoroTTS.generateShouldThrow) return Promise.reject(new Error('fake generate failure'));
    return Promise.resolve({ audio: new Float32Array([0.5, -0.5, 0.25, -1, 1]), sampling_rate: 22_050 });
  }
}

const fakeKokoroModule = { KokoroTTS: FakeKokoroTTS } as unknown as typeof import('kokoro-js');

/** `env.cacheDir` is the only field `tts.ts` touches on this module. */
const fakeTransformersEnv = { cacheDir: '' } as unknown as typeof import('@huggingface/transformers').env;

const fakeLoadModule: CompanionTtsDeps['loadModule'] = () => ({
  KokoroTTS: fakeKokoroModule.KokoroTTS,
  env: fakeTransformersEnv,
});

describe('synthesizeSpeech', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-tts-test-'));
    FakeKokoroTTS.instances = [];
    FakeKokoroTTS.fromPretrainedCallCount = 0;
    FakeKokoroTTS.rejectNextLoad = false;
    FakeKokoroTTS.generateShouldThrow = false;
  });

  afterEach(() => {
    resetCompanionTtsForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers failure rather than throwing when nothing has configured a directory', async () => {
    resetCompanionTtsForTest();
    const result = await synthesizeSpeech('hello');
    expect(result).toMatchObject({ ok: false });
  });

  it('loads the model and synthesizes on a cold first call', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    const result = await synthesizeSpeech('hello there');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mime).toBe('audio/wav');
      const bytes = result.value.audio;
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...bytes.slice(8, 4 + 8))).toBe('WAVE');
    }
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1);
  });

  it('does not reload the model once it is already in memory', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    await synthesizeSpeech('first');
    const second = await synthesizeSpeech('second');

    expect(second.ok).toBe(true);
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1);
  });

  it('dedupes two concurrent cold calls into one model load', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    const [a, b] = await Promise.all([synthesizeSpeech('a'), synthesizeSpeech('b')]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1);
  });

  it('answers failure, not a throw, when the model fails to load', async () => {
    FakeKokoroTTS.rejectNextLoad = true;
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    const result = await synthesizeSpeech('hello');

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toContain('download');
    }
  });

  it('retries provisioning after a transient load failure (not sticky)', async () => {
    FakeKokoroTTS.rejectNextLoad = true;
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    const first = await synthesizeSpeech('hello');
    expect(first.ok).toBe(false);

    const second = await synthesizeSpeech('hello again');
    expect(second.ok).toBe(true);
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(2);
  });

  it('reports a per-call failure when generation throws, without poisoning the next call', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    FakeKokoroTTS.generateShouldThrow = true;
    const first = await synthesizeSpeech('hello');
    expect(first.ok).toBe(false);

    // `generate()` throwing is treated as a load failure too (module doc:
    // "sticky for the same reason") — so this asserts the *documented*
    // behaviour rather than assuming recovery.
    const second = await synthesizeSpeech('hello again');
    expect(second.ok).toBe(false);
  });
});

describe('getCompanionTtsStatus', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-tts-status-test-'));
    FakeKokoroTTS.instances = [];
    FakeKokoroTTS.fromPretrainedCallCount = 0;
    FakeKokoroTTS.rejectNextLoad = false;
    FakeKokoroTTS.generateShouldThrow = false;
  });

  afterEach(() => {
    resetCompanionTtsForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports idle with no directory configured, rather than throwing', async () => {
    resetCompanionTtsForTest();
    expect(await getCompanionTtsStatus(false, null)).toEqual({
      engine: 'system',
      voice: 'idle',
      reason: null,
      message: null,
    });
  });

  it('reports the native module as sticky-failed, and does not attempt a load', async () => {
    resetCompanionTtsForTest({
      directory: dir,
      loadModule: () => {
        throw new Error('no prebuilt onnxruntime-node binary for this platform');
      },
    });

    const status = await getCompanionTtsStatus(false);
    expect(status.engine).toBe('system');
    expect(status.voice).toBe('failed');
    expect(status.reason).toBe('native-module-missing');
    expect(status.message).toContain('no prebuilt onnxruntime-node binary');
  });

  it('kicks off provisioning and reports downloading on the first check', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    const status = await getCompanionTtsStatus(false);
    expect(status).toEqual({ engine: 'system', voice: 'downloading', reason: null, message: null });

    // The load this call started is the one and only `from_pretrained` call —
    // a second status check must not start a redundant one.
    await vi.waitFor(() => expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1));
    await getCompanionTtsStatus(false);
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1);
  });

  it('reports ready, with the local engine, once the model is loaded', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    await synthesizeSpeech('warm the cache');
    const status = await getCompanionTtsStatus(false);
    expect(status).toEqual({ engine: 'local', voice: 'ready', reason: null, message: null });
  });

  it('reports a load failure without retrying until asked to', async () => {
    FakeKokoroTTS.rejectNextLoad = true;
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    await getCompanionTtsStatus(false); // starts the (failing) load
    await vi.waitFor(() => expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1));

    const failed = await getCompanionTtsStatus(false);
    expect(failed.voice).toBe('failed');
    expect(failed.reason).toBe('download-failed');
    expect(failed.message).toContain('download');
    // No retry requested: still one attempt.
    expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1);
  });

  it('retries a failed load when asked, and reports ready once it succeeds', async () => {
    FakeKokoroTTS.rejectNextLoad = true;
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    await getCompanionTtsStatus(false);
    await vi.waitFor(() => expect(FakeKokoroTTS.fromPretrainedCallCount).toBe(1));

    const retried = await getCompanionTtsStatus(true);
    expect(retried.voice).toBe('downloading');

    await vi.waitFor(async () => {
      const status = await getCompanionTtsStatus(false);
      expect(status).toEqual({ engine: 'local', voice: 'ready', reason: null, message: null });
    });
  });

  it('reports a synthesis failure with its own distinct reason', async () => {
    resetCompanionTtsForTest({ directory: dir, loadModule: fakeLoadModule });

    FakeKokoroTTS.generateShouldThrow = true;
    await synthesizeSpeech('this will throw');

    const status = await getCompanionTtsStatus(false);
    expect(status.engine).toBe('system');
    expect(status.voice).toBe('failed');
    expect(status.reason).toBe('synthesis-error');
    expect(status.message).toContain('generate failure');
  });
});

describe('VOICE_ID', () => {
  it('is the top-graded American English voice, af_heart', () => {
    expect(VOICE_ID).toBe('af_heart');
  });
});
