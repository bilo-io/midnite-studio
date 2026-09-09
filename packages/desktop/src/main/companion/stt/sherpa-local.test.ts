import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalWhisperProvider,
  getLocalWhisperStatus,
  resetLocalSttForTest,
} from './sherpa-local';
import { SttError } from './types';

/**
 * Ad Hoc: the microphone must work with no API key.
 *
 * Everything `sherpa-local.ts` does that is not the native module itself,
 * against fakes for `sherpa-onnx-node`, `unbzip2-stream` and `fetch` — no
 * real network call, no real bzip2 decompression, no real ONNX runtime.
 * Mirrors `tts.test.ts`'s own shape line for line: this provider follows
 * that module's "lazy require, download once, degrade rather than crash"
 * pattern exactly.
 */

type FakeRecognizerResult = { text: string; tokens: string[]; timestamps: number[] };

class FakeOfflineStream {
  waveform: { samples: Float32Array; sampleRate: number } | null = null;
  acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void {
    this.waveform = wave;
  }
}

class FakeOfflineRecognizer {
  static instances: FakeOfflineRecognizer[] = [];
  static createCount = 0;
  static shouldThrowOnCreate = false;
  static decodeText = 'hello there';
  static decodeShouldThrow = false;
  static decodeDelayMs = 0;

  constructor(public readonly config: unknown) {}

  static async createAsync(config: unknown): Promise<FakeOfflineRecognizer> {
    FakeOfflineRecognizer.createCount += 1;
    if (FakeOfflineRecognizer.shouldThrowOnCreate) throw new Error('fake construct failure');
    const instance = new FakeOfflineRecognizer(config);
    FakeOfflineRecognizer.instances.push(instance);
    return instance;
  }

  createStream(): FakeOfflineStream {
    return new FakeOfflineStream();
  }

  async decodeAsync(_stream: FakeOfflineStream): Promise<FakeRecognizerResult> {
    if (FakeOfflineRecognizer.decodeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, FakeOfflineRecognizer.decodeDelayMs));
    }
    if (FakeOfflineRecognizer.decodeShouldThrow) throw new Error('fake decode failure');
    return { text: FakeOfflineRecognizer.decodeText, tokens: [], timestamps: [] };
  }
}

const fakeSherpaOnnxModule = {
  OfflineRecognizer: FakeOfflineRecognizer,
  readWaveFromBinary: () => ({ samples: new Float32Array([0, 0.1, -0.1]), sampleRate: 16_000 }),
} as unknown as typeof import('sherpa-onnx-node');

/** Identity "decompressor" — every test feeds already-plain tar bytes. */
vi.mock('unbzip2-stream', () => ({
  default: () => {
    const listeners = new Map<string, Array<(...args: never[]) => void>>();
    return {
      on(event: string, cb: (...args: never[]) => void) {
        const arr = listeners.get(event) ?? [];
        arr.push(cb);
        listeners.set(event, arr);
        return this;
      },
      end(buf: Buffer) {
        queueMicrotask(() => {
          for (const cb of listeners.get('data') ?? []) (cb as (chunk: Buffer) => void)(buf);
          for (const cb of listeners.get('end') ?? []) (cb as () => void)();
        });
      },
    };
  },
}));

// --- a minimal, hand-rolled tar builder (mirrors sherpa-local.ts's own reader) ---

function tarHeader(name: string, size: number, typeflag: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
  header.write(typeflag, 156, 1, 'utf8');
  return header;
}

type TarEntry = { name: string; data?: Buffer; dir?: boolean };

function buildTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    if (entry.dir === true) {
      parts.push(tarHeader(entry.name, 0, '5'));
      continue;
    }
    const data = entry.data ?? Buffer.alloc(0);
    parts.push(tarHeader(entry.name, data.length, '0'));
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
    data.copy(padded);
    parts.push(padded);
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const TARBALL_ROOT = 'sherpa-onnx-whisper-tiny.en';

function validTarball(): Buffer {
  return buildTar([
    { name: `${TARBALL_ROOT}/`, dir: true },
    { name: `${TARBALL_ROOT}/tiny.en-encoder.int8.onnx`, data: Buffer.from('fake int8 encoder') },
    { name: `${TARBALL_ROOT}/tiny.en-decoder.int8.onnx`, data: Buffer.from('fake int8 decoder') },
    { name: `${TARBALL_ROOT}/tiny.en-tokens.txt`, data: Buffer.from('<|endoftext|> 0\n') },
    // Present in the real release, and must NOT be copied into modelDir().
    { name: `${TARBALL_ROOT}/tiny.en-encoder.onnx`, data: Buffer.from('fake fp32 encoder') },
    { name: `${TARBALL_ROOT}/tiny.en-decoder.onnx`, data: Buffer.from('fake fp32 decoder') },
    { name: `${TARBALL_ROOT}/test_wavs/`, dir: true },
    { name: `${TARBALL_ROOT}/test_wavs/0.wav`, data: Buffer.from('fake wav') },
  ]);
}

function fakeFetch(response: Response | (() => Response)): typeof fetch {
  return vi.fn(async () => (typeof response === 'function' ? response() : response)) as unknown as typeof fetch;
}

function tarResponse(tarball: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(tarball));
        controller.close();
      },
    }),
  } as unknown as Response;
}

/** A byte array that passes `looksLikeWav` — a RIFF/WAVE signature is all `readWaveFromBinary` is faked to need. */
function fakeWavAudio(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  return bytes;
}

describe('createLocalWhisperProvider', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-local-stt-test-'));
    FakeOfflineRecognizer.instances = [];
    FakeOfflineRecognizer.createCount = 0;
    FakeOfflineRecognizer.shouldThrowOnCreate = false;
    FakeOfflineRecognizer.decodeText = 'hello there';
    FakeOfflineRecognizer.decodeShouldThrow = false;
    FakeOfflineRecognizer.decodeDelayMs = 0;
  });

  afterEach(() => {
    resetLocalSttForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  const abortSignalThatNeverFires = (): AbortSignal => new AbortController().signal;

  it('answers failure rather than throwing when nothing has configured a directory', async () => {
    resetLocalSttForTest();
    const provider = createLocalWhisperProvider('', null);
    await expect(
      provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires()),
    ).rejects.toThrow(SttError);
  });

  it('rejects a recording that is not WAV, with a recovery step naming the cloud fallback', async () => {
    resetLocalSttForTest({ directory: dir, loadModule: () => fakeSherpaOnnxModule });
    const provider = createLocalWhisperProvider('');
    await expect(
      provider.transcribe(new Uint8Array([1, 2, 3, 4]), 'audio/webm', abortSignalThatNeverFires()),
    ).rejects.toMatchObject({ recovery: expect.stringContaining('OpenAI Whisper') });
  });

  it('ignores the key it is handed — the whole point of the provider', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    const provider = createLocalWhisperProvider('this-is-not-a-real-key');

    const text = await provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires());
    expect(text).toBe('hello there');
  });

  it('downloads, extracts, and transcribes on a cold first call — only the int8 files land on disk', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    const provider = createLocalWhisperProvider('');

    const text = await provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires());

    expect(text).toBe('hello there');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(FakeOfflineRecognizer.createCount).toBe(1);

    const modelDir = join(dir, 'companion-stt', 'whisper-tiny.en-int8');
    expect(existsSync(join(modelDir, 'tiny.en-encoder.int8.onnx'))).toBe(true);
    expect(existsSync(join(modelDir, 'tiny.en-decoder.int8.onnx'))).toBe(true);
    expect(existsSync(join(modelDir, 'tiny.en-tokens.txt'))).toBe(true);
    expect(existsSync(join(modelDir, 'tiny.en-encoder.onnx'))).toBe(false);
    expect(existsSync(join(modelDir, 'test_wavs', '0.wav'))).toBe(false);
  });

  it('does not re-download or reconstruct the recognizer once warm', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    const provider = createLocalWhisperProvider('');

    await provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires());
    await provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(FakeOfflineRecognizer.createCount).toBe(1);
  });

  it('strips Whisper\'s own silence hallucination to the empty string', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    FakeOfflineRecognizer.decodeText = '[ Silence ]';
    const provider = createLocalWhisperProvider('');

    const text = await provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires());
    expect(text).toBe('');
  });

  it('answers failure, not a throw, when the download fails', async () => {
    const fetchImpl = fakeFetch(tarResponse(Buffer.alloc(0), false, 404));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    const provider = createLocalWhisperProvider('');

    await expect(
      provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires()),
    ).rejects.toThrow(/download/);
  });

  it('is sticky once the native module itself fails to load', async () => {
    resetLocalSttForTest({
      directory: dir,
      loadModule: () => {
        throw new Error('no prebuilt binary for this platform');
      },
    });
    const provider = createLocalWhisperProvider('');

    await expect(
      provider.transcribe(fakeWavAudio(), 'audio/wav', abortSignalThatNeverFires()),
    ).rejects.toThrow(/unavailable on this machine/);
    const status = await getLocalWhisperStatus(false);
    expect(status.state).toBe('failed');
    expect(status.reason).toBe('native-module-missing');
  });

  it('settles at the caller\'s abort rather than waiting out a slow native decode', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });
    FakeOfflineRecognizer.decodeDelayMs = 200;
    const provider = createLocalWhisperProvider('');

    const controller = new AbortController();
    const pending = provider.transcribe(fakeWavAudio(), 'audio/wav', controller.signal);
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toThrow(SttError);
  });
});

describe('getLocalWhisperStatus', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-local-stt-status-test-'));
    FakeOfflineRecognizer.instances = [];
    FakeOfflineRecognizer.createCount = 0;
    FakeOfflineRecognizer.shouldThrowOnCreate = false;
    FakeOfflineRecognizer.decodeText = 'hello there';
    FakeOfflineRecognizer.decodeShouldThrow = false;
    FakeOfflineRecognizer.decodeDelayMs = 0;
  });

  afterEach(() => {
    resetLocalSttForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports idle with no directory configured, rather than throwing', async () => {
    resetLocalSttForTest();
    expect(await getLocalWhisperStatus(false, null)).toEqual({
      state: 'idle',
      reason: null,
      message: null,
    });
  });

  it('kicks off provisioning and reports downloading on the first check — the requirement that the download must be surfaced', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const status = await getLocalWhisperStatus(false);
    expect(status).toEqual({ state: 'downloading', reason: null, message: null });

    await getLocalWhisperStatus(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports ready once the model lands on disk', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    await vi.waitFor(async () => {
      const status = await getLocalWhisperStatus(false);
      expect(status).toEqual({ state: 'ready', reason: null, message: null });
    });
  });

  it('reports a download failure without retrying until asked to, then recovers on retry', async () => {
    let attempt = 0;
    const fetchImpl = fakeFetch(() => {
      attempt += 1;
      return attempt === 1 ? tarResponse(Buffer.alloc(0), false, 500) : tarResponse(validTarball());
    });
    resetLocalSttForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    await getLocalWhisperStatus(false);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const failed = await getLocalWhisperStatus(false);
    expect(failed.state).toBe('failed');
    expect(failed.reason).toBe('download-failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const retried = await getLocalWhisperStatus(true);
    expect(retried.state).toBe('downloading');
    await vi.waitFor(async () => {
      expect(await getLocalWhisperStatus(false)).toEqual({ state: 'ready', reason: null, message: null });
    });
  });
});
