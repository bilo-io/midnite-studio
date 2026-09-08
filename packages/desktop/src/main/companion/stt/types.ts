import type { SttProviderId } from '@midnite/studio-shared';

/**
 * The speech-to-text seam (Phase 79 Theme F, Decision 2).
 *
 * Chromium's own `SpeechRecognition` is not an option: in Electron it routes
 * to a Google endpoint with an API key Electron does not ship and fails with a
 * network error. So voice-in is a cloud provider, and a cloud provider means a
 * key — which is why every line of this lives in **main**. The renderer records
 * the audio and receives the text; it never holds the key, never sees the
 * request, and has no `fetch` to the provider at all.
 *
 * The interface is three arguments wide on purpose and no wider:
 *
 * - `audio` is the `MediaRecorder` blob's bytes, unconverted. Whisper accepts
 *   webm/opus as-is, which is the whole reason it ships first (Decision 8) —
 *   a provider needing PCM would drag an encoder into main.
 * - `mime` travels beside the bytes rather than being assumed, because
 *   `MediaRecorder` does not always honour the type it was asked for and a
 *   provider told the wrong container answers 400.
 * - `signal` is how the 15 s timeout actually stops the request, rather than
 *   merely stopping the caller waiting for it. A provider that ignores it
 *   leaks a socket and a paid request per abandoned utterance.
 *
 * **The key is not an argument.** A provider is *constructed* with it
 * ({@link SttProviderFactory}), so the key is read from `safeStorage` once at
 * the call site that needs it and never travels through the transcribe
 * signature — nothing that logs or wraps a `transcribe` call can accidentally
 * capture it.
 */
export type SttProvider = {
  readonly id: SttProviderId;
  /** The transcript, or a throw whose message is safe to show a user. */
  transcribe(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<string>;
};

/** Build a provider around one key. */
export type SttProviderFactory = (key: string) => SttProvider;

/**
 * A provider failure with a message already fit to speak aloud.
 *
 * The phase doc requires mic errors to be "spoken once and shown inline with
 * the recovery step", which means the *recovery step* has to survive the trip
 * out of the provider. A bare `Error` from `fetch` says "fetch failed", which
 * tells a user nothing about their expired key.
 */
export class SttError extends Error {
  constructor(
    message: string,
    /** What the user should do about it, one clause. Empty when there is nothing to do. */
    readonly recovery: string = '',
  ) {
    super(message);
    this.name = 'SttError';
  }
}

/** `message — recovery`, or just the message when there is no step to take. */
export function sttErrorText(error: unknown): string {
  if (error instanceof SttError) {
    return error.recovery.length > 0 ? `${error.message} ${error.recovery}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
