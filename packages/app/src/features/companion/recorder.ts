import {
  COMPANION_RECORDER_MIME,
  COMPANION_RECORDER_TIMESLICE_MS,
  failure,
  type GitOpResult,
  type SttProviderId,
} from '@midnite/studio-shared';

/**
 * Voice-in: capture here, recognition in main (Phase 79 Theme F).
 *
 * This module's whole job is to turn a held button into a blob. It does not
 * recognise anything, does not hold a key, and never talks to a provider — the
 * bytes go over `mstudio:companion:transcribe` and the text comes back.
 * Chromium's own `SpeechRecognition` is not an option at all: in Electron it
 * routes to a Google endpoint with an API key Electron does not ship and fails
 * with a network error, which is the fact that shapes this entire theme.
 *
 * **The permission is not asked for here.** `getUserMedia` triggers it, and
 * main answers through `browser-security.ts`'s carve-out: `media`, audio only,
 * from the app's own origin. Every browser-pane session still refuses
 * everything. So the failure mode "denied" below is a *policy* answer, not a
 * dialog nobody clicked.
 *
 * **The stream is stopped, not kept.** Holding an open `MediaStream` between
 * utterances would leave the OS microphone indicator lit for the life of the
 * app — for a companion that is off by default, that is the single most
 * alarming thing it could do. The cost is a fresh `getUserMedia` per press,
 * which is milliseconds after the first grant.
 */

/** Why a capture could not start, in the shapes a user can act on. */
export type RecorderErrorKind = 'denied' | 'no-device' | 'unsupported' | 'busy' | 'failed';

export class RecorderError extends Error {
  constructor(
    readonly kind: RecorderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RecorderError';
  }
}

/**
 * What the companion says, and what the input bar shows beneath it.
 *
 * One sentence and one recovery step per kind, because the phase doc requires
 * a mic error to be "spoken once and shown inline with the recovery step" —
 * and a `NotAllowedError` is not a sentence.
 */
export function recorderErrorMessage(kind: RecorderErrorKind): string {
  switch (kind) {
    case 'denied':
      return 'I could not use the microphone — permission was refused. Allow microphone access for Midnite Studio in System Settings, Privacy & Security.';
    case 'no-device':
      return 'I could not find a microphone. Connect one, then try again.';
    case 'unsupported':
      return 'This build cannot record audio. Type instead, and the rest still works.';
    case 'busy':
      return 'I am already listening.';
    case 'failed':
    default:
      return 'The recording failed. Try again.';
  }
}

/** Injected so the tests need neither a real microphone nor a real `MediaRecorder`. */
export type RecorderDeps = {
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  /** The `MediaRecorder` constructor, or null where the API is absent. */
  createRecorder:
    | ((stream: MediaStream, options: { mimeType?: string }) => MediaRecorder)
    | null;
  /** `MediaRecorder.isTypeSupported`, which not every build has. */
  isTypeSupported: (mime: string) => boolean;
  transcribe: (req: {
    /*
      `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`: the bridge's schema
      is `z.instanceof(Uint8Array)`, which infers the concrete buffer type, and
      a bare `Uint8Array` (i.e. over `ArrayBufferLike`) would allow a
      `SharedArrayBuffer`-backed view the structured clone cannot carry.
    */
    audio: Uint8Array<ArrayBuffer>;
    mime: string;
    providerId?: SttProviderId;
  }) => Promise<GitOpResult<{ text: string }>>;
};

export const defaultRecorderDeps = (): RecorderDeps => ({
  getUserMedia:
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
      ? (constraints) => navigator.mediaDevices.getUserMedia(constraints)
      : null,
  createRecorder:
    typeof MediaRecorder === 'function'
      ? (stream, options) => new MediaRecorder(stream, options)
      : null,
  isTypeSupported: (mime) =>
    typeof MediaRecorder === 'function' && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(mime)
      : false,
  transcribe: async (req) => {
    const bridge = typeof window === 'undefined' ? undefined : window.midniteStudio?.companion;
    if (!bridge?.transcribe) {
      return failure('Transcription is not available in this window.');
    }
    return bridge.transcribe(req);
  },
});

/**
 * The mime actually asked for.
 *
 * `audio/webm;codecs=opus` is what OpenAI Whisper takes as-is, which is the
 * whole reason it ships first (Decision 8). Where the build does not support
 * it the recorder is handed `''` and Chromium picks its own container — and
 * because the *actual* type travels beside the bytes, a provider is never told
 * the wrong one. Guessing here and asserting later is the bug this avoids.
 */
export function preferredRecorderMime(isTypeSupported: (mime: string) => boolean): string {
  for (const candidate of [COMPANION_RECORDER_MIME, 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export type CompanionRecorder = {
  /** Open the microphone and start capturing. Throws {@link RecorderError}. */
  startRecording: () => Promise<void>;
  /** Stop and hand back what was captured. Resolves with an empty blob if nothing was. */
  stopRecording: () => Promise<Blob>;
  /** Stop and discard — Escape, or a state change that makes the utterance moot. */
  cancelRecording: () => void;
  isRecording: () => boolean;
  /** Send a blob to main for recognition. Never throws; the envelope carries the failure. */
  transcribe: (blob: Blob, providerId?: SttProviderId) => Promise<GitOpResult<{ text: string }>>;
};

export function createRecorder(overrides: Partial<RecorderDeps> = {}): CompanionRecorder {
  const deps: RecorderDeps = { ...defaultRecorderDeps(), ...overrides };

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let mime = '';

  const releaseStream = (): void => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  };

  const teardown = (): void => {
    recorder = null;
    releaseStream();
  };

  return {
    isRecording: () => recorder !== null,

    startRecording: async () => {
      if (recorder !== null) throw new RecorderError('busy', recorderErrorMessage('busy'));
      if (deps.getUserMedia === null || deps.createRecorder === null) {
        throw new RecorderError('unsupported', recorderErrorMessage('unsupported'));
      }

      let opened: MediaStream;
      try {
        // Audio only, and *exactly* audio only: the permission carve-out in
        // main grants `media` when `mediaTypes` is exactly `['audio']`, so
        // asking for video here would be refused outright rather than
        // downgraded.
        opened = await deps.getUserMedia({ audio: true });
      } catch (error) {
        throw new RecorderError(classifyMediaError(error), recorderErrorMessage(classifyMediaError(error)));
      }

      mime = preferredRecorderMime(deps.isTypeSupported);
      chunks = [];
      try {
        const created = deps.createRecorder(opened, mime.length > 0 ? { mimeType: mime } : {});
        created.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        stream = opened;
        recorder = created;
        /*
          A timeslice, so `dataavailable` fires every 250 ms rather than once
          at stop. Push-to-talk means a release can land in the same tick as
          the stop, and a recorder that only ever emits on stop has produced
          nothing to emit yet — this is what makes a very short press still
          carry audio.
        */
        created.start(COMPANION_RECORDER_TIMESLICE_MS);
      } catch (error) {
        for (const track of opened.getTracks()) track.stop();
        recorder = null;
        stream = null;
        throw new RecorderError(
          'failed',
          error instanceof Error ? error.message : recorderErrorMessage('failed'),
        );
      }
    },

    stopRecording: async () => {
      const active = recorder;
      if (active === null) return new Blob([], { type: mime });

      const blob = await new Promise<Blob>((resolve) => {
        active.onstop = () => {
          /*
            The blob's type comes from the *recorder*, not from what was asked
            for: Chromium may hand back plain `audio/webm` where
            `audio/webm;codecs=opus` was requested, and a provider told the
            wrong container answers 400. This is the one place that truth
            exists, and it travels with the bytes from here.
          */
          resolve(new Blob(chunks, { type: active.mimeType || mime || 'audio/webm' }));
        };
        active.stop();
      });

      teardown();
      chunks = [];
      return blob;
    },

    cancelRecording: () => {
      const active = recorder;
      recorder = null;
      chunks = [];
      try {
        if (active !== null && active.state !== 'inactive') {
          // Detached first: a `stop()` that fires `onstop` after the cancel
          // would otherwise resolve a promise nobody is waiting on.
          active.onstop = null;
          active.ondataavailable = null;
          active.stop();
        }
      } catch {
        // A recorder already torn down by the browser. Nothing to do.
      }
      releaseStream();
    },

    transcribe: async (blob, providerId) => {
      if (blob.size === 0) {
        return failure('That recording was empty. Hold the mic button while you speak.');
      }
      /*
        `arrayBuffer()` then a view — no base64. The `Uint8Array` is
        structured-cloned across the boundary exactly as `pty:data` is, which
        is a third less wire and two fewer copies than encoding it would be.
      */
      const audio = new Uint8Array(await blob.arrayBuffer());
      return deps.transcribe({
        audio,
        mime: blob.type.length > 0 ? blob.type : COMPANION_RECORDER_MIME,
        ...(providerId === undefined ? {} : { providerId }),
      });
    },
  };
}

/**
 * Map a `getUserMedia` rejection onto something sayable.
 *
 * The DOM names are the contract here rather than the messages, which differ
 * per platform. `NotAllowedError` covers both a user refusal and our own
 * permission handler answering `false`, and they deserve the same sentence:
 * from the renderer's side they are the same event, and the recovery — System
 * Settings — is the same either way.
 */
export function classifyMediaError(error: unknown): RecorderErrorKind {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  if (name === 'NotSupportedError' || name === 'TypeError') return 'unsupported';
  return 'failed';
}

/**
 * The app's recorder.
 *
 * A singleton for the same reason the speaker is one: there is one microphone,
 * and two recorders racing `getUserMedia` would leave one of them holding a
 * stream nobody stops.
 */
export const companionRecorder: CompanionRecorder = createRecorder();

/** The three the panel's mic button calls, bound to the singleton. */
export const startRecording = (): Promise<void> => companionRecorder.startRecording();
export const stopRecording = (): Promise<Blob> => companionRecorder.stopRecording();
export const cancelRecording = (): void => companionRecorder.cancelRecording();
export const isRecording = (): boolean => companionRecorder.isRecording();
export const transcribe = (
  blob: Blob,
  providerId?: SttProviderId,
): Promise<GitOpResult<{ text: string }>> => companionRecorder.transcribe(blob, providerId);
