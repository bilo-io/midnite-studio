import {
  COMPANION_STT_MAX_BYTES,
  COMPANION_STT_TIMEOUT_MS,
  DEFAULT_STT_PROVIDER_ID,
  STT_PROVIDER_LABELS,
  failure,
  ok,
  type GitOpResult,
  type SttProviderId,
} from '@midnite/studio-shared';

import { createOpenAiWhisperProvider } from './openai-whisper';
import { nullSttCredentials, type SttCredentials } from './credentials';
import { sttErrorText, type SttProviderFactory } from './types';

/**
 * The transcribe path (Phase 79 Theme F).
 *
 * One function between the channel and a provider, and everything that is not
 * provider-specific lives here rather than being reimplemented per vendor: the
 * byte cap, the key lookup, the 15 s abort, and the mapping from "it threw" to
 * the `GitOpResult` envelope the renderer renders inline.
 *
 * **It never throws.** `GitOpResult`'s error arm is the contract for the same
 * reason it is everywhere else in this app — a 401, a rate limit, a timeout
 * and "no key configured" are normal outcomes the input bar shows with a
 * recovery step, not exceptions. An exception crossing `ipcRenderer.invoke`
 * arrives as an opaque "Error invoking remote method …" with the real cause
 * gone, which for a spoken error message is worse than useless.
 */

/**
 * The providers that actually exist.
 *
 * `deepgram` is deliberately absent: it is in `SttProviderId` to keep the
 * interface from being shaped around one vendor's request (Decision 8), and a
 * request for it gets a "not implemented" error naming it rather than a type
 * error at a call site. Adding it is this table plus one file.
 */
export const STT_PROVIDER_FACTORIES: Partial<Record<SttProviderId, SttProviderFactory>> = {
  'openai-whisper': (key) => createOpenAiWhisperProvider(key),
};

export type TranscribeDeps = {
  credentials: SttCredentials;
  factories?: Partial<Record<SttProviderId, SttProviderFactory>>;
  timeoutMs?: number;
  /** Injected so the round-trip time in a Test result is assertable. */
  now?: () => number;
};

let configured: TranscribeDeps = { credentials: nullSttCredentials };

/** Injected at boot with a vault rooted at `app.getPath('userData')`. */
export function configureStt(credentials: SttCredentials): void {
  configured = { credentials };
}

export function sttDeps(): TranscribeDeps {
  return configured;
}

/** Reset module state. Tests only. */
export function resetSttDepsForTest(): void {
  configured = { credentials: nullSttCredentials };
}

export type TranscribeInput = {
  audio: Uint8Array;
  mime: string;
  providerId?: SttProviderId;
};

/**
 * Which provider a request means.
 *
 * An absent `providerId` is the mic button, which means "whichever the user
 * configured" — resolved to the single configured provider when there is
 * exactly one, and to the default otherwise. Resolving to *the* configured one
 * rather than always to the default is what will let a deepgram-only user work
 * without a preference field existing.
 */
export async function resolveProviderId(
  requested: SttProviderId | undefined,
  credentials: SttCredentials,
): Promise<SttProviderId> {
  if (requested !== undefined) return requested;
  const configuredIds = await credentials.configured();
  return configuredIds.length === 1 ? (configuredIds[0] as SttProviderId) : DEFAULT_STT_PROVIDER_ID;
}

export async function transcribeUtterance(
  input: TranscribeInput,
  deps: TranscribeDeps = sttDeps(),
): Promise<GitOpResult<{ text: string }>> {
  if (input.audio.byteLength === 0) {
    return failure('That recording was empty. Hold the mic button while you speak.');
  }
  /*
    Checked here rather than in the zod schema because the limit is a *policy*
    about cost and memory, not a shape — and a schema rejection would be
    reported as "invalid payload" instead of a sentence a user can act on. Both
    consequences of an unbounded blob are real: a main-process allocation and a
    paid API request.
  */
  if (input.audio.byteLength > COMPANION_STT_MAX_BYTES) {
    return failure(
      `That recording is too large to transcribe (${Math.round(input.audio.byteLength / 1024)} KB). Try a shorter utterance.`,
    );
  }

  const providerId = await resolveProviderId(input.providerId, deps.credentials);
  const factory = (deps.factories ?? STT_PROVIDER_FACTORIES)[providerId];
  if (factory === undefined) {
    return failure(
      `${STT_PROVIDER_LABELS[providerId]} is not implemented yet. Choose another provider in Settings, Companion, Microphone.`,
    );
  }

  const key = await deps.credentials.get(providerId);
  if (key === null || key.length === 0) {
    return failure(
      deps.credentials.isAvailable()
        ? `No ${STT_PROVIDER_LABELS[providerId]} key is stored. Add one in Settings, Companion, Microphone.`
        : `This machine cannot store a key securely, so the ${STT_PROVIDER_LABELS[providerId]} key has to be entered again each launch. Add it in Settings, Companion, Microphone.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? COMPANION_STT_TIMEOUT_MS);
  try {
    const text = await factory(key).transcribe(input.audio, input.mime, controller.signal);
    return ok({ text: text.trim() });
  } catch (error) {
    /*
      The abort is checked before the error is read: a provider that surfaces
      an abort as a generic network failure (undici does) would otherwise be
      reported as "check the network connection" for what is actually our own
      15-second deadline, and the recovery step differs.
    */
    if (controller.signal.aborted) {
      return failure(
        `Transcription took longer than ${Math.round((deps.timeoutMs ?? COMPANION_STT_TIMEOUT_MS) / 1000)} seconds and was given up on. Try again, or try a shorter utterance.`,
      );
    }
    return failure(sttErrorText(error));
  } finally {
    clearTimeout(timeout);
  }
}

// --- the Test button -------------------------------------------------------

/**
 * One second of silence, as a WAV.
 *
 * A **WAV, not webm**, and built here rather than shipped as a fixture: a
 * silent opus stream needs an encoder, whereas 16-bit PCM silence is a 44-byte
 * header and a run of zeros, and every provider that takes webm also takes
 * wav. The phase's "no audio assets" guardrail is honoured for the same reason
 * the melodies are numbers.
 *
 * The point of the Test button is the 401/429/DNS failure it rules out, not
 * the transcript — a provider handed silence usually answers with the empty
 * string, and that is a **pass**.
 */
export function silentWavClip(seconds = 1, sampleRate = 16_000): Uint8Array {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  // The samples themselves are already zero — that is the silence.

  return new Uint8Array(buffer);
}

/** Run the silent clip through a provider and report the round-trip time. */
export async function testSttCredential(
  providerId: SttProviderId,
  deps: TranscribeDeps = sttDeps(),
): Promise<GitOpResult<{ ms: number; text: string }>> {
  const clock = deps.now ?? Date.now;
  const started = clock();
  const result = await transcribeUtterance(
    { audio: silentWavClip(), mime: 'audio/wav', providerId },
    deps,
  );
  if (!result.ok) return result;
  return ok({ ms: Math.max(0, clock() - started), text: result.value.text });
}
