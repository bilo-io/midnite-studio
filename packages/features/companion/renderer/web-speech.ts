/**
 * The browser's built-in `SpeechRecognition` (Web Speech API), as an opt-in
 * STT engine (Ad Hoc: companion input + voice improvements).
 *
 * **Kept opt-in, never the default.** In Electron, Chromium's
 * `webkitSpeechRecognition` depends on a Google-hosted recognition service
 * and an API key Electron does not ship — `recorder.ts`'s own docblock
 * already called this out when Phase 79 Theme F chose the server-side
 * `MediaRecorder` + IPC path instead. Manually starting a recognition
 * session against a packaged-equivalent build of this app reproduces exactly
 * that: `onerror` fires with `error: 'network'` within a second of
 * `start()`, before any audio is read. So this module is reached only when
 * `useUiStore().companionSttEngine === 'webSpeech'` — a switch that defaults
 * off (`CompanionSttEngineSchema`) — and its own error copy
 * ({@link webSpeechErrorMessage}) tells the user to switch back rather than
 * pretending the failure is theirs.
 *
 * No types from `lib.dom` cover this API (it is non-standard), so the shapes
 * below are the minimal structural subset this module actually reads.
 */

export type WebSpeechResult = { ok: true; text: string } | { ok: false; message: string };

type SpeechRecognitionResultLike = { 0?: { transcript?: string } };
type SpeechRecognitionEventLike = { results?: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorEventLike = { error?: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Whether this build's Chromium *exposes* the constructor — not whether a
 * session will actually recognise anything (see the module doc's Electron
 * caveat). The mic button reads this while `webSpeech` is selected, same as
 * it reads `sttStatus()` for the server engine.
 */
export function webSpeechSupported(): boolean {
  return speechRecognitionCtor() !== null;
}

export type WebSpeechSession = {
  /** End the utterance and wait for the last result to arrive. */
  stop: () => void;
  /** Discard whatever was heard — Escape, or a state change that makes it moot. */
  cancel: () => void;
};

/**
 * Start listening. `onDone` fires exactly once: with the transcript, with an
 * error, or with an empty transcript if nothing was recognised before the
 * session ended on its own. Returns `null` when the API is unavailable or
 * `start()` throws synchronously (Chromium raises `InvalidStateError` for a
 * second concurrent session, which `voice-ports.ts` already prevents by
 * construction — the null return is the defensive half).
 */
export function startWebSpeechRecognition(
  onDone: (result: WebSpeechResult) => void,
): WebSpeechSession | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  let cancelled = false;
  let settled = false;
  const finish = (result: WebSpeechResult): void => {
    if (settled || cancelled) return;
    settled = true;
    onDone(result);
  };

  recognition.onresult = (event) => {
    const results = event.results ? Array.from(event.results) : [];
    const text = results
      .map((result) => result[0]?.transcript ?? '')
      .join(' ')
      .trim();
    finish({ ok: true, text });
  };
  recognition.onerror = (event) => {
    finish({ ok: false, message: webSpeechErrorMessage(event.error) });
  };
  // Fires after `onresult`/`onerror` too (a no-op there, `settled` guards
  // it) and alone when the engine simply stopped hearing anything — the
  // "empty transcript" case `voice-ports.ts` already has a sentence for.
  recognition.onend = () => {
    finish({ ok: true, text: '' });
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => recognition.stop(),
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}

/** {@link recorderErrorMessage}'s counterpart for a `SpeechRecognitionErrorEvent.error` code. */
export function webSpeechErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'network':
      return 'The built-in browser speech engine could not reach its recognition service — this is expected in Electron. Switch back to the offline engine in Settings ▸ Companion ▸ Microphone.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'I could not use the microphone — permission was refused. Allow microphone access for Midnite Studio in System Settings, Privacy & Security.';
    case 'no-speech':
      return 'I did not catch that. Try again, a little closer to the microphone.';
    case 'audio-capture':
      return 'I could not find a microphone. Connect one, then try again.';
    default:
      return 'The built-in browser speech engine failed. Switch back to the offline engine in Settings ▸ Companion ▸ Microphone.';
  }
}
