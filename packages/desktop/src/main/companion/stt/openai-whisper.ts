import { SttError, type SttProvider } from './types';

/**
 * OpenAI Whisper — the one provider that ships (Phase 79, Decision 8).
 *
 * Chosen for exactly one property: `/v1/audio/transcriptions` accepts the
 * `audio/webm;codecs=opus` blob `MediaRecorder` already produces, as **one
 * multipart request per utterance**, with no streaming protocol to implement
 * and no encoder in main. The recorder is push-to-talk, so streaming buys
 * nothing — the utterance is complete before the request is made.
 *
 * `deepgram` is the second `SttProviderId` behind the same interface and has
 * no implementation here; `index.ts` answers a request for it with "not
 * implemented" rather than a type error, which is what makes adding it a file
 * rather than a refactor.
 *
 * **No SDK.** A plain `fetch` from main, for the reason the phase's scope
 * guardrail gives — nothing in this phase adds a renderer dependency, and a
 * desktop-only SDK for one endpoint that takes a `FormData` is a dependency
 * for a function call. `fetch`, `FormData`, `Blob` and `AbortSignal` are all
 * globals in the Node the packaged Electron ships.
 */
export const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * `whisper-1` rather than one of the newer transcription models.
 *
 * It is the endpoint's long-standing default, it is the cheapest, and it
 * accepts webm/opus — which is the only property this seam depends on. Making
 * it a constant rather than an option keeps the provider's surface at "a key",
 * and a model picker in Settings would be a preference nobody has asked for.
 */
export const OPENAI_WHISPER_MODEL = 'whisper-1';

/**
 * Injected so `openai-whisper.test.ts` can exercise every status branch
 * against a fake, and so the URL can be pointed at a local stub without an
 * environment variable that would also apply in production.
 */
export type OpenAiWhisperDeps = {
  fetch?: typeof globalThis.fetch;
  url?: string;
  model?: string;
};

/**
 * A filename with an extension the endpoint recognises.
 *
 * Not cosmetic: the multipart `file` part's **filename** is how OpenAI decides
 * the container, and a blob sent as `blob` with no extension is rejected as an
 * unsupported format even when its bytes are perfectly good webm. The mime may
 * arrive with parameters (`audio/webm;codecs=opus`), so the subtype is taken
 * before the `;`.
 */
export function whisperFilename(mime: string): string {
  const subtype = (mime.split(';')[0] ?? '').split('/')[1]?.trim().toLowerCase() ?? '';
  const extension =
    {
      webm: 'webm',
      ogg: 'ogg',
      opus: 'ogg',
      'x-wav': 'wav',
      wave: 'wav',
      wav: 'wav',
      mp4: 'mp4',
      'x-m4a': 'm4a',
      m4a: 'm4a',
      mpeg: 'mp3',
      mp3: 'mp3',
      flac: 'flac',
      // An unknown subtype is sent as webm, because that is what the recorder
      // produces — guessing our own default beats sending no extension, which
      // is a guaranteed rejection.
    }[subtype] ?? 'webm';
  return `utterance.${extension}`;
}

/**
 * Turn a non-2xx into something worth speaking.
 *
 * Every branch names a recovery step, because the phase doc requires mic
 * errors to be "spoken once and shown inline with the recovery step" — and by
 * the time the renderer has a status code the step is no longer derivable.
 * The provider's own JSON `error.message` is appended when it exists, since it
 * is often the specific thing (a revoked key, a quota) the status alone
 * cannot say.
 */
export function whisperError(status: number, body: string): SttError {
  const detail = extractErrorMessage(body);
  const suffix = detail.length > 0 ? ` (${detail})` : '';

  if (status === 401 || status === 403) {
    return new SttError(
      `The transcription service rejected the key${suffix}.`,
      'Check the key in Settings, Companion, Microphone.',
    );
  }
  if (status === 429) {
    return new SttError(
      `The transcription service is rate limiting${suffix}.`,
      'Wait a moment and try again.',
    );
  }
  if (status === 413) {
    return new SttError(
      `That recording was too long for the service${suffix}.`,
      'Try a shorter utterance.',
    );
  }
  if (status === 400) {
    return new SttError(
      `The transcription service could not read that recording${suffix}.`,
      'Try again, and check the microphone is the one you meant.',
    );
  }
  if (status >= 500) {
    return new SttError(
      `The transcription service is having trouble${suffix}.`,
      'Try again in a minute.',
    );
  }
  return new SttError(`Transcription failed with status ${status}${suffix}.`, '');
}

/** `{"error":{"message":"…"}}`, the endpoint's shape — best effort, never throws. */
function extractErrorMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    const error = (parsed as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string') return error.message.slice(0, 200);
  } catch {
    // Not JSON — an HTML error page from a proxy, say.
  }
  return body.trim().slice(0, 200);
}

export function createOpenAiWhisperProvider(key: string, deps: OpenAiWhisperDeps = {}): SttProvider {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const url = deps.url ?? OPENAI_TRANSCRIPTIONS_URL;
  const model = deps.model ?? OPENAI_WHISPER_MODEL;

  return {
    id: 'openai-whisper',
    transcribe: async (audio, mime, signal) => {
      const form = new FormData();
      /*
        The bytes are copied into a fresh buffer once, which is unavoidable —
        `FormData` needs a `Blob`, a `Blob` needs an `ArrayBuffer` (the
        `Uint8Array` off a structured clone is typed over `ArrayBufferLike`,
        which may be a `SharedArrayBuffer`), and it is one copy of a few
        hundred kilobytes on a user gesture rather than a hot path.

        The blob's own `type` is set *and* the filename carries the extension:
        the endpoint reads the filename, but a correct content type costs
        nothing and helps any proxy in between.
      */
      const bytes = new Uint8Array(audio.byteLength);
      bytes.set(audio);
      form.append(
        'file',
        new Blob([bytes.buffer as ArrayBuffer], { type: mime }),
        whisperFilename(mime),
      );
      form.append('model', model);
      /*
        `text`, not the default `json`. There is exactly one field wanted and
        parsing a one-key object to reach it is work for nothing — and a
        truncated or non-JSON body from a proxy then fails at `JSON.parse`
        rather than simply being the transcript it looks like.
      */
      form.append('response_format', 'text');

      let response: Response;
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal,
        });
      } catch (error) {
        // An abort is the 15 s timeout firing, which is a different sentence
        // from "the network is down" and a different recovery.
        if (signal.aborted) {
          throw new SttError('Transcription timed out.', 'Try a shorter utterance, or try again.');
        }
        throw new SttError(
          'Could not reach the transcription service.',
          error instanceof Error && error.message.length > 0
            ? `Check the network connection. (${error.message})`
            : 'Check the network connection.',
        );
      }

      const body = await response.text();
      if (!response.ok) throw whisperError(response.status, body);
      return body.trim();
    },
  };
}
