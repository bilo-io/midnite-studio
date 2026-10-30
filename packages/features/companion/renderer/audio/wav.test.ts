import { afterEach, describe, expect, it } from 'vitest';

import { encodeWav, toMono, toWavBlob } from './wav';

/**
 * Ad Hoc: the microphone must work with no API key.
 *
 * `toWavBlob` decodes through `window.AudioContext`, which jsdom does not
 * implement — so most of this exercises the pure helpers directly, plus the
 * fallback path against a fake `AudioContext` this suite installs itself.
 *
 * jsdom's own `Blob` also doesn't implement `.arrayBuffer()` (Chromium's
 * real one does — `app` may not import `node:buffer` either, so this patches
 * the one call `toWavBlob` needs onto a plain jsdom `Blob` rather than
 * reaching for a node builtin).
 */

function riffText(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

/** A jsdom `Blob` with `.arrayBuffer()` filled in, over its own known bytes. */
function blobWithArrayBuffer(bytes: Uint8Array, type: string): Blob {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type }) as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  blob.arrayBuffer = async () => bytes.buffer as ArrayBuffer;
  return blob;
}

describe('encodeWav', () => {
  it('produces a well-formed RIFF/WAVE header over the right number of samples', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = encodeWav(samples, 16_000);

    expect(riffText(wav, 0, 4)).toBe('RIFF');
    expect(riffText(wav, 8, 4)).toBe('WAVE');
    expect(riffText(wav, 12, 4)).toBe('fmt ');
    expect(riffText(wav, 36, 4)).toBe('data');
    expect(wav.length).toBe(44 + samples.length * 2);
  });

  it('clamps out-of-range samples rather than wrapping', () => {
    const wav = encodeWav(new Float32Array([2, -2]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

describe('toMono', () => {
  it('passes a single channel through unchanged', () => {
    const data = new Float32Array([0.1, 0.2, 0.3]);
    const buffer = {
      numberOfChannels: 1,
      length: 3,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
    expect(toMono(buffer)).toBe(data);
  });

  it('averages multiple channels', () => {
    const left = new Float32Array([1, 1]);
    const right = new Float32Array([0, -1]);
    const buffer = {
      numberOfChannels: 2,
      length: 2,
      getChannelData: (channel: number) => (channel === 0 ? left : right),
    } as unknown as AudioBuffer;
    expect(Array.from(toMono(buffer))).toEqual([0.5, 0]);
  });
});

describe('toWavBlob', () => {
  const originalAudioContext = (window as { AudioContext?: unknown }).AudioContext;

  afterEach(() => {
    (window as { AudioContext?: unknown }).AudioContext = originalAudioContext;
  });

  it('returns the original blob unchanged when there is no AudioContext at all', async () => {
    delete (window as { AudioContext?: unknown }).AudioContext;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    const result = await toWavBlob(blob);
    expect(result).toBe(blob);
  });

  it('returns the original blob unchanged for an empty recording', async () => {
    const blob = new Blob([], { type: 'audio/webm' });
    const result = await toWavBlob(blob);
    expect(result).toBe(blob);
  });

  it('decodes and re-encodes as WAV when AudioContext is available', async () => {
    const fakeSamples = new Float32Array([0, 0.25, -0.25]);
    class FakeAudioContext {
      async decodeAudioData(): Promise<AudioBuffer> {
        return {
          numberOfChannels: 1,
          length: fakeSamples.length,
          sampleRate: 16_000,
          getChannelData: () => fakeSamples,
        } as unknown as AudioBuffer;
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

    const blob = blobWithArrayBuffer(new Uint8Array([1, 2, 3, 4]), 'audio/webm;codecs=opus');
    const result = await toWavBlob(blob);

    // `result` is built inside `toWavBlob` with the ambient (jsdom) `Blob`,
    // whose own `.arrayBuffer()` isn't implemented in this test environment
    // (Chromium's real one is, and `encodeWav`'s own test above already
    // covers the byte layout) — `.size`/`.type` are enough to prove this
    // path actually ran `decodeAudioData` and re-encoded, rather than
    // falling back to the original compressed blob.
    expect(result.type).toBe('audio/wav');
    expect(result.size).toBe(44 + fakeSamples.length * 2);
  });

  it('falls back to the original blob when decodeAudioData rejects', async () => {
    class ThrowingAudioContext {
      async decodeAudioData(): Promise<AudioBuffer> {
        throw new Error('corrupt recording');
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = ThrowingAudioContext;

    const blob = blobWithArrayBuffer(new Uint8Array([9, 9, 9]), 'audio/webm');
    const result = await toWavBlob(blob);
    expect(result).toBe(blob);
  });
});
