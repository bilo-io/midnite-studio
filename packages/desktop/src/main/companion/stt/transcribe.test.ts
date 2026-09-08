import { COMPANION_STT_MAX_BYTES } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createFakeSttProvider } from './fake';
import {
  resolveProviderId,
  silentWavClip,
  testSttCredential,
  transcribeUtterance,
  type TranscribeDeps,
} from './index';
import { SttError } from './types';

/**
 * Phase 79 Theme F — everything the transcribe path does that is not
 * vendor-specific, against the fake provider (the phase's own verification
 * item). No network, no key, no stubbed global.
 */

const audio = new Uint8Array([1, 2, 3, 4]);

/**
 * The error arm's message, narrowed.
 *
 * `result.ok === false` alone still leaves the `conflict` arm in the union —
 * which `GitOpResult` carries for every channel even where, as here, no
 * caller can produce one. Narrowing on `kind` is what makes the field
 * readable.
 */
const errorMessage = (result: { ok: boolean; kind?: string; message?: string }): string =>
  result.ok === false && result.kind === 'error' ? (result.message ?? '') : '';

/** A credentials-shaped fake. */
function fakeCredentials(
  keys: Partial<Record<'openai-whisper' | 'deepgram', string>> = { 'openai-whisper': 'sk-test' },
  available = true,
) {
  return {
    isAvailable: () => available,
    get: async (provider: 'openai-whisper' | 'deepgram') => keys[provider] ?? null,
    set: async () => {},
    clear: async () => {},
    configured: async () =>
      (Object.keys(keys) as ('openai-whisper' | 'deepgram')[]).filter(
        (id) => keys[id] !== undefined,
      ),
  };
}

const withProvider = (
  provider: ReturnType<typeof createFakeSttProvider>,
  over: Partial<TranscribeDeps> = {},
): TranscribeDeps => ({
  credentials: fakeCredentials(),
  factories: { 'openai-whisper': () => provider },
  ...over,
});

describe('transcribeUtterance', () => {
  it('hands the bytes and the mime through unchanged and returns the transcript', async () => {
    const provider = createFakeSttProvider({ text: '  start an adhoc task  ' });
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm;codecs=opus' },
      withProvider(provider),
    );

    expect(result).toEqual({ ok: true, value: { text: 'start an adhoc task' } });
    expect(provider.calls).toEqual([{ audio, mime: 'audio/webm;codecs=opus' }]);
  });

  it('passes the key to the factory, not to transcribe', async () => {
    const factory = vi.fn(() => createFakeSttProvider({ text: 'hi' }));
    await transcribeUtterance(
      { audio, mime: 'audio/webm' },
      { credentials: fakeCredentials(), factories: { 'openai-whisper': factory } },
    );
    expect(factory).toHaveBeenCalledExactlyOnceWith('sk-test');
  });

  it('refuses an empty recording with the gesture that fixes it', async () => {
    const result = await transcribeUtterance(
      { audio: new Uint8Array(), mime: 'audio/webm' },
      withProvider(createFakeSttProvider()),
    );
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect(errorMessage(result)).toContain('Hold the mic button');
  });

  /*
    The cap is policy about cost and memory, not shape — so it is here rather
    than in the zod schema, where a rejection would read "invalid payload"
    instead of a sentence naming the size.
  */
  it('refuses an oversized blob before spending a request on it', async () => {
    const provider = createFakeSttProvider({ text: 'never' });
    const result = await transcribeUtterance(
      { audio: new Uint8Array(COMPANION_STT_MAX_BYTES + 1), mime: 'audio/webm' },
      withProvider(provider),
    );
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect(errorMessage(result)).toContain('too large');
    expect(provider.calls).toEqual([]);
  });

  it('names the missing key and where to add it', async () => {
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm' },
      withProvider(createFakeSttProvider(), { credentials: fakeCredentials({}) }),
    );
    expect(errorMessage(result)).toContain('No OpenAI Whisper key is stored');
  });

  it('says so differently when the machine cannot store one at all', async () => {
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm' },
      withProvider(createFakeSttProvider(), { credentials: fakeCredentials({}, false) }),
    );
    expect(errorMessage(result)).toContain('cannot store a key securely');
  });

  it('answers a provider with no implementation by name rather than a type error', async () => {
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm', providerId: 'deepgram' },
      { credentials: fakeCredentials({ deepgram: 'dg-key' }), factories: {} },
    );
    expect(errorMessage(result)).toContain('not implemented yet');
  });

  it('turns a provider failure into the error arm with its recovery step attached', async () => {
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm' },
      withProvider(
        createFakeSttProvider({
          failWith: new SttError('The transcription service rejected the key.', 'Check it.'),
        }),
      ),
    );
    expect(errorMessage(result)).toBe(
      'The transcription service rejected the key. Check it.',
    );
  });

  it('reports a non-Error throw rather than crashing on it', async () => {
    const result = await transcribeUtterance(
      { audio, mime: 'audio/webm' },
      withProvider(createFakeSttProvider({ failWith: new Error('boom') })),
    );
    expect(errorMessage(result)).toBe('boom');
  });

  it('gives up at the timeout and says so as a timeout, not a network failure', async () => {
    vi.useFakeTimers();
    try {
      const pending = transcribeUtterance(
        { audio, mime: 'audio/webm' },
        withProvider(createFakeSttProvider({ delayMs: 30_000 }), { timeoutMs: 15_000 }),
      );
      await vi.advanceTimersByTimeAsync(15_001);
      const result = await pending;
      expect(result).toMatchObject({ ok: false, kind: 'error' });
      expect(errorMessage(result)).toContain('longer than 15 seconds');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire the timeout for a request that finished in time', async () => {
    vi.useFakeTimers();
    try {
      const pending = transcribeUtterance(
        { audio, mime: 'audio/webm' },
        withProvider(createFakeSttProvider({ text: 'quick', delayMs: 100 }), { timeoutMs: 15_000 }),
      );
      await vi.advanceTimersByTimeAsync(200);
      expect(await pending).toEqual({ ok: true, value: { text: 'quick' } });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveProviderId', () => {
  it('honours an explicit id — Settings tests the provider being edited', async () => {
    expect(await resolveProviderId('deepgram', fakeCredentials())).toBe('deepgram');
  });

  it('uses the single configured provider when there is exactly one', async () => {
    expect(await resolveProviderId(undefined, fakeCredentials({ deepgram: 'dg' }))).toBe('deepgram');
  });

  it('falls back to the default when none or several are configured', async () => {
    expect(await resolveProviderId(undefined, fakeCredentials({}))).toBe('openai-whisper');
    expect(
      await resolveProviderId(
        undefined,
        fakeCredentials({ 'openai-whisper': 'sk', deepgram: 'dg' }),
      ),
    ).toBe('openai-whisper');
  });
});

describe('silentWavClip', () => {
  it('is a well-formed RIFF/WAVE header over the right number of samples', () => {
    const clip = silentWavClip(1, 16_000);
    const text = (start: number, length: number): string =>
      String.fromCharCode(...clip.slice(start, start + length));

    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(text(36, 4)).toBe('data');
    // 44-byte header + one second of 16-bit mono at 16 kHz.
    expect(clip.byteLength).toBe(44 + 16_000 * 2);

    const view = new DataView(clip.buffer, clip.byteOffset, clip.byteLength);
    expect(view.getUint32(4, true)).toBe(clip.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(16_000 * 2);
  });

  it('is actually silent', () => {
    expect(silentWavClip().slice(44).every((byte) => byte === 0)).toBe(true);
  });

  it('never produces a zero-length clip', () => {
    expect(silentWavClip(0).byteLength).toBe(46);
  });
});

describe('testSttCredential', () => {
  it('sends one second of silence and reports the round-trip', async () => {
    const provider = createFakeSttProvider({ text: '' });
    let clock = 1_000;
    const result = await testSttCredential('openai-whisper', {
      ...withProvider(provider),
      now: () => (clock += 120) - 120,
    });

    expect(result).toEqual({ ok: true, value: { ms: 120, text: '' } });
    expect(provider.calls[0]?.mime).toBe('audio/wav');
    // The empty transcript is a *pass*: the point is the 401 it ruled out.
    expect(provider.calls[0]?.audio.byteLength).toBe(44 + 16_000 * 2);
  });

  it('passes a provider failure straight through', async () => {
    const result = await testSttCredential('openai-whisper', {
      ...withProvider(createFakeSttProvider({ failWith: 'rejected' })),
    });
    expect(result).toMatchObject({ ok: false, kind: 'error', message: 'rejected' });
  });
});
