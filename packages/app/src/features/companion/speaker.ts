import {
  COMPANION_LEVEL_DECAY_MS,
  COMPANION_LEVEL_VAR,
  chunkForSpeech,
} from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';

/**
 * Text-to-speech (Phase 79 Theme F).
 *
 * Voice-*out* is the free half of this phase. `speechSynthesis` works in
 * Electron and uses the macOS voices, so there is no channel, no key and no
 * provider here — everything below is a queue, a workaround and a pulse.
 * (Voice-*in* is the opposite story and lives in `recorder.ts` plus
 * `main/companion/stt/`, because Chromium's recogniser routes to a Google
 * endpoint Electron has no key for.)
 *
 * Three things earn their complexity:
 *
 * **The queue.** `speechSynthesis.speak` is fire-and-forget with a global
 * queue nothing else in this app shares, and utterances from two overlapping
 * callers interleave unpredictably. So one queue here, drained in order, with
 * `cancel()` emptying it — the companion has one mouth.
 *
 * **The chunking.** A well-known Chromium bug silences an utterance after
 * roughly fifteen seconds, and — worse than the silence — `onend` never fires,
 * so a queue waiting on it stalls forever. `chunkForSpeech` (in `shared`, with
 * the tests) keeps every utterance under ~200 characters.
 *
 * **The pulse.** Theme H's `[data-companion-state="speaking"]` rule reads a
 * `--companion-level` custom property as its box-shadow radius, so the FAB
 * glows with the words. This file is the only writer: each word boundary sets
 * it to 1 and it decays to 0 over 180 ms. The property name is a constant in
 * `shared` precisely because it is a contract between two themes built by two
 * agents.
 */

/**
 * Structurally the `SpeakOptions` Theme E's `ports.ts` declares.
 *
 * Declared here rather than imported so this module compiles before that file
 * exists — the two themes were built in parallel. The shapes are identical on
 * purpose, and `speaker.ts` is wired into `setCompanionSpeaker` once both have
 * landed.
 */
export type CompanionSpeakOptions = {
  /** Called on each word boundary with the character offset into `text`. */
  onBoundary?: (charIndex: number) => void;
  /** Cancels this utterance without touching whatever is queued behind it. */
  signal?: AbortSignal;
};

/**
 * The port shape: `speak`, `cancel`, and whether this speaker makes a sound.
 *
 * `available` is what lets the concierge post a turn as `spoken: false` on a
 * machine (or a test) with no `speechSynthesis` at all, instead of claiming to
 * have read something aloud that nobody heard.
 */
export type CompanionSpeaker = {
  speak(text: string, opts?: CompanionSpeakOptions): Promise<void>;
  cancel(): void;
  readonly available?: boolean;
};

/** Everything the speaker touches outside itself, injected so the tests need no globals. */
export type SpeakerDeps = {
  synth: SpeechSynthesis | null;
  /** Constructor rather than a factory function — `new SpeechSynthesisUtterance(text)`. */
  utterance: (text: string) => SpeechSynthesisUtterance;
  /** The persisted `companionVoice` URI, or null for "the default for the locale". */
  getVoiceUri: () => string | null;
  getLocale: () => string;
  /** Writes `--companion-level`. Injected because jsdom has a `document` but no FAB. */
  setLevel: (level: number) => void;
  /** rAF, or a shim under fake timers. Returns a cancel handle. */
  schedule: (callback: (now: number) => void) => number;
  cancelScheduled: (handle: number) => void;
  now: () => number;
};

/**
 * Write the pulse onto the document root.
 *
 * The **root**, not the FAB element: Theme H puts `data-companion-state` on
 * two hosts (the FAB button and the panel's `gradient-frame`) and both read
 * this one variable, so a per-element write would need this module to know
 * about both. A custom property on `:root` inherits into everything and costs
 * one style invalidation.
 *
 * Rounded to two decimals because the value lands in a CSS `calc()` and a
 * sixteen-digit float there is bytes of string churn per word for a difference
 * no eye can see.
 */
export function setCompanionLevel(level: number): void {
  if (typeof document === 'undefined') return;
  const clamped = Math.min(1, Math.max(0, level));
  document.documentElement.style.setProperty(COMPANION_LEVEL_VAR, clamped.toFixed(2));
}

export const defaultSpeakerDeps = (): SpeakerDeps => ({
  synth: typeof window === 'undefined' ? null : (window.speechSynthesis ?? null),
  utterance: (text) => new SpeechSynthesisUtterance(text),
  /*
    Read at speak time, not captured: the voice picker in Settings changes
    `companionVoice` while the companion is idle, and the next sentence should
    use it without anything re-registering.
  */
  getVoiceUri: () => useUiStore.getState().companionVoice,
  getLocale: () =>
    typeof navigator === 'undefined' ? 'en-US' : (navigator.language ?? 'en-US'),
  setLevel: setCompanionLevel,
  schedule: (callback) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(() => callback(Date.now()), 16) as unknown as number),
  cancelScheduled: (handle) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  },
  now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
});

/**
 * Choose the voice for an utterance.
 *
 * The stored URI wins when it still resolves — a voice can vanish between
 * launches (a removed language pack, a different machine), and silently
 * falling back beats speaking nothing. Then the app locale's exact match, then
 * its language (`en-GB` for `en`), then whatever the platform calls default,
 * then the first voice there is. `null` means "let the platform decide", which
 * is a valid answer rather than a failure.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  uri: string | null,
  locale: string,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (uri !== null) {
    const stored = voices.find((voice) => voice.voiceURI === uri);
    if (stored) return stored;
  }
  const language = locale.split('-')[0]?.toLowerCase() ?? 'en';
  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`)) ??
    voices.find((voice) => voice.lang.toLowerCase() === language) ??
    voices.find((voice) => voice.default) ??
    voices[0] ??
    null
  );
}

/**
 * Every installed voice, once they have actually loaded.
 *
 * `getVoiceset()` is empty on first call in Chromium and populated after a
 * `voiceschanged` event — the Settings voice picker rendering an empty list is
 * the classic symptom. Resolves immediately when the list is already there,
 * and resolves *empty* on timeout rather than hanging: a machine with no
 * voices is a real state, and the picker says so.
 */
export function loadCompanionVoices(
  synth: SpeechSynthesis | null = typeof window === 'undefined'
    ? null
    : (window.speechSynthesis ?? null),
  timeoutMs = 2_000,
): Promise<SpeechSynthesisVoice[]> {
  if (!synth) return Promise.resolve([]);
  const immediate = synth.getVoices();
  if (immediate.length > 0) return Promise.resolve([...immediate]);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', finish);
      clearTimeout(timer);
      resolve([...synth.getVoices()]);
    };
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener?.('voiceschanged', finish);
  });
}

type QueueItem = {
  chunks: string[];
  /** Character offset of each chunk within the original text, for `onBoundary`. */
  offsets: number[];
  opts: CompanionSpeakOptions;
  resolve: () => void;
};

export function createSpeaker(overrides: Partial<SpeakerDeps> = {}): CompanionSpeaker & {
  /** Whether anything is queued or speaking. Exposed for the filler scheduler's no-overlap rule. */
  isSpeaking: () => boolean;
} {
  const deps: SpeakerDeps = { ...defaultSpeakerDeps(), ...overrides };
  const queue: QueueItem[] = [];
  let active: QueueItem | null = null;
  let decayHandle: number | null = null;
  let levelSetAt = 0;

  const stopDecay = (): void => {
    if (decayHandle !== null) deps.cancelScheduled(decayHandle);
    decayHandle = null;
  };

  /**
   * Fall from 1 to 0 over 180 ms, one rAF at a time, and **stop scheduling**
   * once it lands.
   *
   * The stop is the whole point: a permanently-running rAF loop for a glow
   * that is usually 0 is precisely the kind of idle cost Phase 36's visibility
   * gates exist to remove, and Theme G's own idle-CPU claim would not survive
   * it. Between words there is a frame or two of work; between utterances,
   * none.
   */
  const decay = (): void => {
    stopDecay();
    decayHandle = deps.schedule(() => {
      decayHandle = null;
      const elapsed = deps.now() - levelSetAt;
      const next = Math.max(0, 1 - elapsed / COMPANION_LEVEL_DECAY_MS);
      deps.setLevel(next);
      if (next > 0) decay();
    });
  };

  const pulse = (): void => {
    levelSetAt = deps.now();
    deps.setLevel(1);
    decay();
  };

  const clearLevel = (): void => {
    stopDecay();
    deps.setLevel(0);
  };

  const finish = (item: QueueItem): void => {
    if (active === item) active = null;
    item.resolve();
    clearLevel();
    void drain();
  };

  const drain = async (): Promise<void> => {
    if (active !== null) return;
    const item = queue.shift();
    if (item === undefined) return;
    active = item;

    const synth = deps.synth;
    if (!synth) {
      finish(item);
      return;
    }

    const voices = synth.getVoices();
    const voice = pickVoice(voices, deps.getVoiceUri(), deps.getLocale());

    let index = 0;
    const speakNext = (): void => {
      if (active !== item) return;
      if (item.opts.signal?.aborted === true) {
        finish(item);
        return;
      }
      const chunk = item.chunks[index];
      if (chunk === undefined) {
        finish(item);
        return;
      }
      const base = item.offsets[index] ?? 0;
      index += 1;

      const utterance = deps.utterance(chunk);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? deps.getLocale();
      utterance.onboundary = (event) => {
        // `word`, not every boundary: `sentence` boundaries fire once per
        // chunk and would make the pulse a single blink.
        if (event.name !== undefined && event.name !== 'word') return;
        item.opts.onBoundary?.(base + (event.charIndex ?? 0));
        pulse();
      };
      /*
        `onerror` is treated exactly as `onend`, not as a failure to report.
        The commonest error here is `interrupted` — which is what
        `synth.cancel()` raises on the utterance it just killed — and a
        cancelled sentence is a normal outcome, not something to speak an
        apology about.
      */
      utterance.onend = speakNext;
      utterance.onerror = speakNext;
      synth.speak(utterance);
    };

    speakNext();
  };

  return {
    available: deps.synth !== null,

    speak: (text, opts = {}) => {
      const chunks = chunkForSpeech(text);
      if (chunks.length === 0) return Promise.resolve();

      /*
        Offsets are recomputed against the original text rather than summed
        from the chunk lengths, because `chunkForSpeech` normalises whitespace
        — summing would drift by one character per collapsed run and
        `onBoundary`'s caller (a highlight, eventually) would point at the
        wrong word. `indexOf` from the last position is exact and the strings
        are short.
      */
      const offsets: number[] = [];
      let cursor = 0;
      for (const chunk of chunks) {
        const found = text.indexOf(chunk, cursor);
        const at = found === -1 ? cursor : found;
        offsets.push(at);
        cursor = at + chunk.length;
      }

      return new Promise<void>((resolve) => {
        const item: QueueItem = { chunks, offsets, opts, resolve };
        queue.push(item);
        /*
          An already-aborted signal is honoured *after* enqueueing rather than
          by refusing the call, so `speak` has one exit path and a caller that
          aborts mid-sentence and a caller that aborts before it sees the same
          resolved promise.
        */
        opts.signal?.addEventListener(
          'abort',
          () => {
            if (active === item) {
              deps.synth?.cancel();
              finish(item);
              return;
            }
            const queued = queue.indexOf(item);
            if (queued !== -1) {
              queue.splice(queued, 1);
              item.resolve();
            }
          },
          { once: true },
        );
        void drain();
      });
    },

    cancel: () => {
      /*
        Resolve every waiter rather than leaving them hanging. `speak` returns
        `Promise<void>` and the concierge decides what a cancelled line means
        by checking its own signal — a rejection here would be an unhandled
        one at every call site that did not think to catch.
      */
      const pending = [...queue];
      queue.length = 0;
      const current = active;
      active = null;
      deps.synth?.cancel();
      clearLevel();
      for (const item of pending) item.resolve();
      current?.resolve();
    },

    isSpeaking: () => active !== null || queue.length > 0,
  };
}

/**
 * The app's speaker.
 *
 * A module singleton for the reason the queue exists: there is one set of
 * speakers on the machine, and two instances would interleave through
 * `speechSynthesis`'s global queue. Theme E's `setCompanionSpeaker` is handed
 * this object once; everything else calls it through that port.
 */
export const companionTtsSpeaker: CompanionSpeaker & { isSpeaking: () => boolean } = createSpeaker();
