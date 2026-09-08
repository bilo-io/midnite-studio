import {
  COMPANION_LEVEL_DECAY_MS,
  COMPANION_LEVEL_VAR,
  chunkForSpeech,
} from '@midnite/studio-shared';

import { bridge, hasBridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { getCompanionAudio } from './audio/context';

/**
 * Text-to-speech (Phase 79 Theme F; the local engine below is Phase 80 Theme C).
 *
 * Voice-*out* was the free half of Phase 79. `speechSynthesis` works in
 * Electron and uses the OS voices, so no channel, no key and no provider was
 * needed for it — a queue, a chunking workaround and a pulse, all below in
 * `createSpeaker`. (Voice-*in* is the opposite story and lives in
 * `recorder.ts` plus `main/companion/stt/`, because Chromium's recogniser
 * routes to a Google endpoint Electron has no key for.)
 *
 * Theme C adds a second, *preferred* engine for the same port:
 * `createLocalSpeaker` calls the new `mstudio:companion:tts-synthesize`
 * channel (text in, one WAV clip out) and plays the result through the
 * companion's own `AudioContext`/master gain instead of
 * `SpeechSynthesisUtterance` — so `companionVolume` affects it identically,
 * with no separate volume control. `createCompanionSpeaker` is the module
 * singleton's actual factory: it tries the local engine first and falls back
 * to `speechSynthesis` — sticky for the renderer's lifetime — the instant the
 * local engine reports anything other than success, so a missing native
 * module or an unprovisioned voice on the main side never leaves the
 * companion mute.
 *
 * Three things earn `createSpeaker`'s complexity:
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

// --- the local voice engine (Phase 80 Theme C) ------------------------------

/** Everything `createLocalSpeaker` touches outside itself, injected for the same reason `SpeakerDeps` is. */
export type LocalSpeakerDeps = {
  /** `bridge()?.companion.ttsSynthesize` — absent under jsdom/no-preload, where the local engine is simply unavailable. */
  synthesize: (
    text: string,
  ) => Promise<{ ok: true; audio: Uint8Array; mime: string } | { ok: false }>;
  /** The companion's shared `AudioContext`/master gain, or `null` where there is no Web Audio at all. */
  getAudio: () => { ctx: AudioContext; master: GainNode } | null;
  /** Whether there is a preload bridge to call at all — `available`'s coarse, synchronous half; see the module doc. */
  hasBridge: () => boolean;
  setLevel: (level: number) => void;
  schedule: (callback: (now: number) => void) => number;
  cancelScheduled: (handle: number) => void;
  now: () => number;
};

export const defaultLocalSpeakerDeps = (): LocalSpeakerDeps => ({
  synthesize: async (text) => {
    const result = await bridge()?.companion.ttsSynthesize({ text });
    return result?.ok === true
      ? { ok: true, audio: result.value.audio, mime: result.value.mime }
      : { ok: false };
  },
  getAudio: getCompanionAudio,
  hasBridge,
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

type LocalQueueItem = {
  chunks: string[];
  opts: CompanionSpeakOptions;
  /** Unlike the system speaker's `resolve()`, this also reports whether the
   *  local engine actually spoke it — `createCompanionSpeaker` below falls
   *  back to `speechSynthesis` on `false`. */
  settle: (spoken: boolean) => void;
};

/**
 * The local engine's own `CompanionSpeaker`, playable standalone (tests, and
 * anyone who wants the local voice specifically) but normally reached only
 * through `createCompanionSpeaker`'s fallback wrapper below.
 *
 * No word-boundary events: sherpa-onnx-node returns one clip per chunk with no
 * per-word timing, so `onBoundary` fires once per chunk (at its start) rather
 * than once per word — coarser than `speechSynthesis`'s, and nothing today
 * reads more than that (see `speaker.ts`'s own module doc).
 */
export function createLocalSpeaker(overrides: Partial<LocalSpeakerDeps> = {}): CompanionSpeaker & {
  isSpeaking: () => boolean;
  /** The real primitive: resolves `false` when the engine never produced audio for this utterance. */
  speakLocal: (text: string, opts?: CompanionSpeakOptions) => Promise<boolean>;
} {
  const deps: LocalSpeakerDeps = { ...defaultLocalSpeakerDeps(), ...overrides };
  const queue: LocalQueueItem[] = [];
  let active: LocalQueueItem | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let decayHandle: number | null = null;
  let levelSetAt = 0;

  const stopDecay = (): void => {
    if (decayHandle !== null) deps.cancelScheduled(decayHandle);
    decayHandle = null;
  };

  /** Same shape as `createSpeaker`'s own `decay`/`pulse` — see that one for why it stops scheduling once it lands. */
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

  const finish = (item: LocalQueueItem, spoken: boolean): void => {
    if (active === item) active = null;
    if (currentSource !== null) {
      try {
        currentSource.stop();
      } catch {
        // Already stopped/ended. Nothing to do.
      }
      currentSource = null;
    }
    item.settle(spoken);
    clearLevel();
    void drain();
  };

  const drain = (): void => {
    if (active !== null) return;
    const item = queue.shift();
    if (item === undefined) return;
    active = item;

    const audio = deps.getAudio();
    if (audio === null) {
      finish(item, false);
      return;
    }

    let index = 0;
    const playNext = async (): Promise<void> => {
      if (active !== item) return;
      if (item.opts.signal?.aborted === true) {
        // A cancelled utterance is a normal outcome, not a fallback trigger.
        finish(item, true);
        return;
      }
      const chunk = item.chunks[index];
      if (chunk === undefined) {
        finish(item, true);
        return;
      }
      index += 1;

      /*
        Everything from here down is wrapped in one `try` — including
        `deps.synthesize` itself. A bridge with no `ttsSynthesize` at all (an
        e2e harness, an older preload) throws a `TypeError` calling it, not a
        rejected `GitOpResult`, and that throw must fail soft exactly like a
        `{ok:false}` answer does: unwrapped, it becomes an unhandled rejection
        on this fire-and-forget chain, `finish` never runs, and the caller's
        `speakLocal` promise — and everything awaiting it, the whole concierge
        flow included — hangs forever instead of falling back.
      */
      try {
        const result = await deps.synthesize(chunk);
        if (active !== item) return; // cancelled while the request was in flight
        if (!result.ok) {
          finish(item, false);
          return;
        }

        // `.slice()` first: the `Uint8Array` crossing the IPC boundary may not
        // tightly wrap its own `ArrayBuffer`, and `decodeAudioData` wants one
        // sized to exactly the bytes it should read.
        const decoded = await audio.ctx.decodeAudioData(result.audio.slice().buffer);
        if (active !== item) return;

        const source = audio.ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(audio.master);
        currentSource = source;
        item.opts.onBoundary?.(0);
        pulse();
        source.onended = () => {
          if (currentSource === source) currentSource = null;
          void playNext();
        };
        source.start();
      } catch {
        finish(item, false);
      }
    };

    void playNext();
  };

  const speakLocal = (text: string, opts: CompanionSpeakOptions = {}): Promise<boolean> => {
    const chunks = chunkForSpeech(text);
    if (chunks.length === 0) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      const item: LocalQueueItem = { chunks, opts, settle: resolve };
      queue.push(item);
      opts.signal?.addEventListener(
        'abort',
        () => {
          if (active === item) {
            finish(item, true);
            return;
          }
          const queued = queue.indexOf(item);
          if (queued !== -1) {
            queue.splice(queued, 1);
            item.settle(true);
          }
        },
        { once: true },
      );
      drain();
    });
  };

  return {
    // Coarse and synchronous, matching `SpeakerDeps`'s own `available`: it
    // answers "is there anyone to ask at all", not "will the model actually
    // load" — that answer only exists after a real round trip, which is what
    // `createCompanionSpeaker`'s sticky fallback is for.
    get available() {
      return deps.hasBridge();
    },
    speakLocal,
    speak: (text, opts) => speakLocal(text, opts).then(() => undefined),
    cancel: () => {
      const pending = [...queue];
      queue.length = 0;
      const current = active;
      active = null;
      if (currentSource !== null) {
        try {
          currentSource.stop();
        } catch {
          // Already stopped/ended.
        }
        currentSource = null;
      }
      clearLevel();
      for (const item of pending) item.settle(true);
      current?.settle(true);
    },
    isSpeaking: () => active !== null || queue.length > 0,
  };
}

/**
 * The speaker the rest of the app actually uses: local engine first, falling
 * back to `speechSynthesis` the instant the local engine reports anything
 * other than success — sticky for as long as this object lives, since a
 * native module that failed to load on this machine does not become
 * available mid-session. One utterance is never split across engines
 * mid-sentence: a failure partway through an utterance finishes that
 * utterance's remaining text on the system engine, and every utterance after
 * it goes straight to the system engine too.
 */
export function createCompanionSpeaker(
  overrides: { local?: Partial<LocalSpeakerDeps>; system?: Partial<SpeakerDeps> } = {},
): CompanionSpeaker & { isSpeaking: () => boolean } {
  const local = createLocalSpeaker(overrides.local);
  const system = createSpeaker(overrides.system);
  let useLocal = true;

  return {
    get available() {
      return local.available || system.available;
    },
    speak: async (text, opts = {}) => {
      if (useLocal) {
        const spoken = await local.speakLocal(text, opts);
        if (spoken) return;
        useLocal = false;
        if (opts.signal?.aborted === true) return;
      }
      return system.speak(text, opts);
    },
    cancel: () => {
      local.cancel();
      system.cancel();
    },
    isSpeaking: () => local.isSpeaking() || system.isSpeaking(),
  };
}

/**
 * The app's speaker.
 *
 * A module singleton for the reason the queue exists: there is one set of
 * speakers on the machine, and two instances would interleave through
 * `speechSynthesis`'s global queue (and, now, through the companion's one
 * `AudioContext`). Theme E's `setCompanionSpeaker` is handed this object
 * once; everything else calls it through that port.
 */
export const companionTtsSpeaker: CompanionSpeaker & { isSpeaking: () => boolean } =
  createCompanionSpeaker();
