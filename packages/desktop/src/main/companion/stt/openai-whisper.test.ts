import { describe, expect, it, vi } from 'vitest';

import {
  OPENAI_TRANSCRIPTIONS_URL,
  OPENAI_WHISPER_MODEL,
  createOpenAiWhisperProvider,
  whisperError,
  whisperFilename,
} from './openai-whisper';
import { SttError } from './types';

/** Phase 79 Theme F — the one provider that ships. */

const audio = new Uint8Array([1, 2, 3, 4]);

/** A `fetch`-shaped fake that records the request and answers with a fixed reply. */
function fakeFetch(reply: { status?: number; body?: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => reply.body ?? '',
    } as Response;
  });
  return { fetchFn: fetchFn as unknown as typeof globalThis.fetch, calls };
}

describe('whisperFilename', () => {
  it('reads the subtype past the codecs parameter', () => {
    expect(whisperFilename('audio/webm;codecs=opus')).toBe('utterance.webm');
  });

  it('maps the containers the recorder and the Test clip can produce', () => {
    expect(whisperFilename('audio/wav')).toBe('utterance.wav');
    expect(whisperFilename('audio/ogg')).toBe('utterance.ogg');
    expect(whisperFilename('audio/mp4')).toBe('utterance.mp4');
    expect(whisperFilename('audio/mpeg')).toBe('utterance.mp3');
  });

  /*
    An unknown subtype becomes webm rather than getting no extension: no
    extension is a guaranteed rejection, while our own default is at least a
    correct guess for the only recorder that calls this.
  */
  it('falls back to webm rather than to no extension at all', () => {
    expect(whisperFilename('application/octet-stream')).toBe('utterance.webm');
    expect(whisperFilename('')).toBe('utterance.webm');
  });
});

describe('createOpenAiWhisperProvider', () => {
  it('posts multipart to the transcriptions endpoint with the key as a bearer', async () => {
    const { fetchFn, calls } = fakeFetch({ body: 'start an adhoc task\n' });
    const provider = createOpenAiWhisperProvider('sk-test', { fetch: fetchFn });

    const text = await provider.transcribe(
      audio,
      'audio/webm;codecs=opus',
      new AbortController().signal,
    );

    expect(text).toBe('start an adhoc task');
    expect(calls[0]?.url).toBe(OPENAI_TRANSCRIPTIONS_URL);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toEqual({ Authorization: 'Bearer sk-test' });

    const form = calls[0]?.init.body as FormData;
    expect(form.get('model')).toBe(OPENAI_WHISPER_MODEL);
    // `text`, not the default `json` — one field is wanted and parsing a
    // one-key object to reach it is work for nothing.
    expect(form.get('response_format')).toBe('text');
    const file = form.get('file') as File;
    expect(file.name).toBe('utterance.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
  });

  it('reports the id it is', () => {
    expect(createOpenAiWhisperProvider('sk-test').id).toBe('openai-whisper');
  });

  it('maps a rejected key to a recovery step, not a status code', async () => {
    const { fetchFn } = fakeFetch({
      status: 401,
      body: JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
    });
    const provider = createOpenAiWhisperProvider('sk-bad', { fetch: fetchFn });

    await expect(
      provider.transcribe(audio, 'audio/webm', new AbortController().signal),
    ).rejects.toMatchObject({
      name: 'SttError',
      message: 'The transcription service rejected the key (Incorrect API key provided).',
      recovery: 'Check the key in Settings, Companion, Microphone.',
    });
  });

  it('distinguishes our own timeout from a dead network', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async () => {
      controller.abort();
      throw new Error('This operation was aborted');
    }) as unknown as typeof globalThis.fetch;

    await expect(
      createOpenAiWhisperProvider('sk-test', { fetch: fetchFn }).transcribe(
        audio,
        'audio/webm',
        controller.signal,
      ),
    ).rejects.toMatchObject({ message: 'Transcription timed out.' });
  });

  it('reports an unreachable service as a network problem', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.openai.com');
    }) as unknown as typeof globalThis.fetch;

    await expect(
      createOpenAiWhisperProvider('sk-test', { fetch: fetchFn }).transcribe(
        audio,
        'audio/webm',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      message: 'Could not reach the transcription service.',
      recovery: 'Check the network connection. (getaddrinfo ENOTFOUND api.openai.com)',
    });
  });
});

describe('whisperError', () => {
  it('names a recovery step for every status a user can act on', () => {
    for (const status of [401, 403, 429, 413, 400, 500, 503]) {
      expect(whisperError(status, '').recovery.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the bare status for anything unrecognised', () => {
    const error = whisperError(418, '');
    expect(error).toBeInstanceOf(SttError);
    expect(error.message).toBe('Transcription failed with status 418.');
    expect(error.recovery).toBe('');
  });

  it('appends the provider\'s own message when there is one', () => {
    expect(whisperError(429, JSON.stringify({ error: { message: 'quota exceeded' } })).message).toBe(
      'The transcription service is rate limiting (quota exceeded).',
    );
  });

  it('uses a non-JSON body as-is rather than throwing on it', () => {
    expect(whisperError(502, '<html>Bad Gateway</html>').message).toContain('Bad Gateway');
  });

  it('caps a hostile body rather than speaking it whole', () => {
    expect(whisperError(500, 'x'.repeat(5_000)).message.length).toBeLessThan(300);
  });
});
