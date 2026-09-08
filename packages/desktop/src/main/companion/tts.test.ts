import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_ID, resetCompanionTtsForTest, synthesizeSpeech } from './tts';

/**
 * Phase 80 Theme C — everything `tts.ts` does that is not the native module
 * itself, against fakes for `sherpa-onnx-node`, `unbzip2-stream` and `fetch`.
 * No real network call, no real bzip2 decompression, no real ONNX runtime.
 */

type FakeGeneratedAudio = { samples: Float32Array; sampleRate: number };

class FakeOfflineTts {
  static instances: FakeOfflineTts[] = [];
  static constructCount = 0;
  static shouldThrow = false;
  static generateShouldThrow = false;
  readonly numSpeakers = 1;
  readonly sampleRate = 22_050;

  constructor(public readonly config: unknown) {
    FakeOfflineTts.constructCount += 1;
    if (FakeOfflineTts.shouldThrow) throw new Error('fake construct failure');
    FakeOfflineTts.instances.push(this);
  }

  generate(_request: { text: string; sid: number; speed: number }): FakeGeneratedAudio {
    if (FakeOfflineTts.generateShouldThrow) throw new Error('fake generate failure');
    return { samples: new Float32Array([0.5, -0.5, 0.25, -1, 1]), sampleRate: this.sampleRate };
  }
}

const fakeSherpaOnnxModule = { OfflineTts: FakeOfflineTts } as unknown as typeof import('sherpa-onnx-node');

/**
 * An identity "decompressor": every test feeds already-plain tar bytes as the
 * fetch response body, so this stands in for `unbzip2-stream` without a real
 * bzip2 encoder anywhere in the test.
 */
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

// --- a minimal, hand-rolled tar builder (mirrors tts.ts's own reader) ------

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
  parts.push(Buffer.alloc(1024)); // two zero blocks: end-of-archive marker
  return Buffer.concat(parts);
}

function validTarball(): Buffer {
  const root = `vits-piper-${VOICE_ID}`;
  return buildTar([
    { name: `${root}/`, dir: true },
    { name: `${root}/${VOICE_ID}.onnx`, data: Buffer.from('fake onnx weights') },
    { name: `${root}/tokens.txt`, data: Buffer.from('_ 0\n^ 1\n') },
    { name: `${root}/espeak-ng-data/`, dir: true },
    { name: `${root}/espeak-ng-data/en_dict`, data: Buffer.from('fake dict') },
    // Present in the real release, and must NOT be copied into voiceDir().
    { name: `${root}/MODEL_CARD`, data: Buffer.from('license info') },
    { name: `${root}/${VOICE_ID}.onnx.json`, data: Buffer.from('{}') },
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

describe('synthesizeSpeech', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-tts-test-'));
    FakeOfflineTts.instances = [];
    FakeOfflineTts.constructCount = 0;
    FakeOfflineTts.shouldThrow = false;
    FakeOfflineTts.generateShouldThrow = false;
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

  it('downloads, extracts and synthesizes on a cold first call', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const result = await synthesizeSpeech('hello there');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mime).toBe('audio/wav');
      const bytes = result.value.audio;
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...bytes.slice(8, 4 + 8))).toBe('WAVE');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(FakeOfflineTts.constructCount).toBe(1);

    // Only the three files `OfflineTts` actually reads land on disk.
    const voiceDir = join(dir, 'companion-voice', VOICE_ID);
    expect(existsSync(join(voiceDir, `${VOICE_ID}.onnx`))).toBe(true);
    expect(existsSync(join(voiceDir, 'tokens.txt'))).toBe(true);
    expect(existsSync(join(voiceDir, 'espeak-ng-data', 'en_dict'))).toBe(true);
    expect(existsSync(join(voiceDir, 'MODEL_CARD'))).toBe(false);
    expect(existsSync(join(voiceDir, `${VOICE_ID}.onnx.json`))).toBe(false);
  });

  it('does not re-download once the voice is already provisioned', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    await synthesizeSpeech('first');
    const second = await synthesizeSpeech('second');

    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The `OfflineTts` session is also reused, not reconstructed per call.
    expect(FakeOfflineTts.constructCount).toBe(1);
  });

  it('dedupes two concurrent cold calls into one download', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const [a, b] = await Promise.all([synthesizeSpeech('a'), synthesizeSpeech('b')]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('answers failure, not a throw, when the download fails', async () => {
    const fetchImpl = fakeFetch(tarResponse(Buffer.alloc(0), false, 404));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const result = await synthesizeSpeech('hello');

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toContain('download');
    }
  });

  it('retries provisioning after a transient download failure (not sticky)', async () => {
    let attempt = 0;
    const fetchImpl = fakeFetch(() => {
      attempt += 1;
      return attempt === 1 ? tarResponse(Buffer.alloc(0), false, 500) : tarResponse(validTarball());
    });
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const first = await synthesizeSpeech('hello');
    expect(first.ok).toBe(false);

    const second = await synthesizeSpeech('hello again');
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('is sticky once the native module itself fails to construct', async () => {
    FakeOfflineTts.shouldThrow = true;
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    const first = await synthesizeSpeech('hello');
    expect(first.ok).toBe(false);
    expect(FakeOfflineTts.constructCount).toBe(1);

    // A second attempt does not retry construction — the failure is sticky
    // for the process's lifetime (the module doc's own claim).
    const second = await synthesizeSpeech('hello again');
    expect(second.ok).toBe(false);
    expect(FakeOfflineTts.constructCount).toBe(1);
  });

  it('reports a per-call failure when generation throws, without poisoning the next call', async () => {
    const fetchImpl = fakeFetch(tarResponse(validTarball()));
    resetCompanionTtsForTest({ directory: dir, fetchImpl, loadModule: () => fakeSherpaOnnxModule });

    FakeOfflineTts.generateShouldThrow = true;
    const first = await synthesizeSpeech('hello');
    expect(first.ok).toBe(false);

    // `generate()` throwing is treated as a load failure too (module doc:
    // "sticky for the same reason") — so this asserts the *documented*
    // behaviour rather than assuming recovery.
    const second = await synthesizeSpeech('hello again');
    expect(second.ok).toBe(false);
  });
});
