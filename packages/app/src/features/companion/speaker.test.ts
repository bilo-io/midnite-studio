import { COMPANION_LEVEL_VAR } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCompanionSpeaker,
  createLocalSpeaker,
  createSpeaker,
  loadCompanionVoices,
  pickVoice,
  setCompanionLevel,
  type LocalSpeakerDeps,
  type SpeakerDeps,
} from './speaker';

/**
 * Phase 79 Theme F — the speech-out queue.
 *
 * jsdom has a `document` but no `speechSynthesis`, so every test drives a fake
 * synth. That is the right shape anyway: the interesting behaviour is the
 * queue, the chunking and the pulse, none of which is about a real voice.
 */

type FakeUtterance = {
  text: string;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  onboundary: ((event: { name?: string; charIndex?: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const voice = (over: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice =>
  ({
    voiceURI: 'urn:voice:one',
    name: 'One',
    lang: 'en-US',
    default: false,
    localService: true,
    ...over,
  }) as SpeechSynthesisVoice;

/** A `speechSynthesis`-shaped fake that speaks synchronously when told to. */
function fakeSynth(voices: SpeechSynthesisVoice[] = [voice()]) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
    cancel: vi.fn(() => {
      // Chromium raises `interrupted` on the utterance it kills; the speaker
      // treats that exactly as an end, which is what this reproduces.
      const current = spoken[spoken.length - 1];
      current?.onerror?.();
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return { synth, spoken };
}

/** Deps over a fake synth, with the level writes recorded and rAF made synchronous-on-demand. */
function harness(voices?: SpeechSynthesisVoice[]) {
  const { synth, spoken } = fakeSynth(voices);
  const levels: number[] = [];
  const frames: ((now: number) => void)[] = [];
  let clock = 0;

  const deps: Partial<SpeakerDeps> = {
    synth: synth as unknown as SpeechSynthesis,
    utterance: (text) =>
      ({
        text,
        voice: null,
        lang: '',
        onboundary: null,
        onend: null,
        onerror: null,
      }) as unknown as SpeechSynthesisUtterance,
    getVoiceUri: () => null,
    getLocale: () => 'en-US',
    setLevel: (level) => levels.push(level),
    schedule: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelScheduled: () => {},
    now: () => clock,
  };

  return {
    deps,
    synth,
    spoken,
    levels,
    /** Run every pending frame once, after advancing the clock. */
    tick: (ms: number) => {
      clock += ms;
      const pending = frames.splice(0, frames.length);
      for (const frame of pending) frame(clock);
    },
    /** Finish the utterance the synth is currently holding. */
    end: () => spoken[spoken.length - 1]?.onend?.(),
    boundary: (charIndex = 0) =>
      spoken[spoken.length - 1]?.onboundary?.({ name: 'word', charIndex }),
  };
}

describe('createSpeaker', () => {
  it('speaks a short line as one utterance and resolves when it ends', async () => {
    const h = harness();
    const speaker = createSpeaker(h.deps);

    let done = false;
    const pending = speaker.speak('Here we are.').then(() => {
      done = true;
    });

    expect(h.spoken.map((u) => u.text)).toEqual(['Here we are.']);
    expect(done).toBe(false);
    h.end();
    await pending;
    expect(done).toBe(true);
  });

  /*
    The Chromium workaround, end to end: one long line becomes several
    utterances spoken *in order, one at a time* — not all queued at once,
    because the point is never to have a single long one in flight.
  */
  it('chunks a long line and speaks the chunks one after another', async () => {
    const h = harness();
    const speaker = createSpeaker(h.deps);
    const long = Array.from({ length: 40 }, (_, index) => `Sentence ${index}.`).join(' ');

    const pending = speaker.speak(long);
    expect(h.spoken).toHaveLength(1);
    for (const utterance of h.spoken) expect(utterance.text.length).toBeLessThanOrEqual(200);

    let guard = 0;
    while (h.spoken.length < 3 && guard < 10) {
      h.end();
      guard += 1;
    }
    expect(h.spoken.length).toBeGreaterThan(2);

    while (h.synth.speak.mock.calls.length > 0 && guard < 100) {
      const before = h.spoken.length;
      h.end();
      if (h.spoken.length === before) break;
      guard += 1;
    }
    await pending;
  });

  it('serialises two callers rather than letting them interleave', async () => {
    const h = harness();
    const speaker = createSpeaker(h.deps);

    const first = speaker.speak('One.');
    const second = speaker.speak('Two.');
    expect(h.spoken.map((u) => u.text)).toEqual(['One.']);

    h.end();
    await first;
    expect(h.spoken.map((u) => u.text)).toEqual(['One.', 'Two.']);
    h.end();
    await second;
  });

  it('reports whether it can make a sound at all', () => {
    expect(createSpeaker(harness().deps).available).toBe(true);
    expect(createSpeaker({ ...harness().deps, synth: null }).available).toBe(false);
  });

  it('resolves without speaking when there is no synth', async () => {
    const h = harness();
    await createSpeaker({ ...h.deps, synth: null }).speak('nobody hears this');
    expect(h.spoken).toEqual([]);
  });

  it('resolves rather than hanging on empty text', async () => {
    const h = harness();
    await createSpeaker(h.deps).speak('   ');
    expect(h.spoken).toEqual([]);
  });

  it('picks the voice once per line and stamps its language on every chunk', async () => {
    const chosen = voice({ voiceURI: 'urn:voice:gb', lang: 'en-GB' });
    const h = harness([voice({ lang: 'de-DE' }), chosen]);
    const speaker = createSpeaker({ ...h.deps, getVoiceUri: () => 'urn:voice:gb' });

    const pending = speaker.speak('Here we are.');
    expect(h.spoken[0]?.voice).toBe(chosen);
    expect(h.spoken[0]?.lang).toBe('en-GB');
    h.end();
    await pending;
  });

  describe('the speaking pulse', () => {
    it('sets the level to 1 on each word boundary and decays it to 0', () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      void speaker.speak('Here we are.');

      h.boundary(0);
      expect(h.levels.at(-1)).toBe(1);

      // Half the decay window: half the level.
      h.tick(90);
      expect(h.levels.at(-1)).toBeCloseTo(0.5, 5);

      h.tick(90);
      expect(h.levels.at(-1)).toBe(0);
    });

    /*
      The load-bearing negative for Theme G's idle-CPU claim: once the level
      lands on 0 nothing more is scheduled. A permanently-running rAF loop for
      a glow that is usually 0 is exactly the cost Phase 36's gates exist to
      remove.
    */
    it('stops scheduling frames once the level reaches 0', () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      void speaker.speak('Here we are.');

      h.boundary(0);
      h.tick(200);
      const settled = h.levels.length;
      h.tick(200);
      h.tick(200);
      expect(h.levels.length).toBe(settled);
    });

    it('ignores a sentence boundary — only words drive the pulse', () => {
      const h = harness();
      void createSpeaker(h.deps).speak('Here we are.');
      h.spoken[0]?.onboundary?.({ name: 'sentence', charIndex: 0 });
      expect(h.levels).toEqual([]);
    });

    it('reports the boundary offset against the original text, not the chunk', async () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      const offsets: number[] = [];
      const long = `${'First sentence here. '.repeat(12)}Then the last one.`;

      const pending = speaker.speak(long, { onBoundary: (at) => offsets.push(at) });
      h.boundary(6);
      const firstChunk = h.spoken[0]?.text ?? '';
      h.end();
      h.boundary(3);
      expect(offsets[0]).toBe(6);
      // The second chunk starts past the first, so its offset is not 3.
      expect(offsets[1]).toBeGreaterThan(firstChunk.length - 1);

      let guard = 0;
      while (guard < 40) {
        const before = h.spoken.length;
        h.end();
        guard += 1;
        if (h.spoken.length === before) break;
      }
      await pending;
    });

    it('clears the level when the line finishes', async () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      const pending = speaker.speak('Here we are.');
      h.boundary(0);
      h.end();
      await pending;
      expect(h.levels.at(-1)).toBe(0);
    });
  });

  describe('cancel', () => {
    it('empties the queue, silences the synth and resolves every waiter', async () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);

      const first = speaker.speak('One.');
      const second = speaker.speak('Two.');
      speaker.cancel();

      expect(h.synth.cancel).toHaveBeenCalledTimes(1);
      // Both resolve — a rejection would be unhandled at every call site that
      // did not think to catch it.
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
      expect(speaker.isSpeaking()).toBe(false);
      expect(h.levels.at(-1)).toBe(0);
    });

    it('is a no-op when nothing is speaking', () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      expect(() => speaker.cancel()).not.toThrow();
      expect(speaker.isSpeaking()).toBe(false);
    });
  });

  describe('an abort signal', () => {
    it('cancels the line in flight without touching the one queued behind it', async () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      const controller = new AbortController();

      const first = speaker.speak('One.', { signal: controller.signal });
      const second = speaker.speak('Two.');
      controller.abort();

      await first;
      expect(h.spoken.map((u) => u.text)).toEqual(['One.', 'Two.']);
      h.end();
      await second;
    });

    it('drops a queued line without disturbing the one being spoken', async () => {
      const h = harness();
      const speaker = createSpeaker(h.deps);
      const controller = new AbortController();

      const first = speaker.speak('One.');
      const second = speaker.speak('Two.', { signal: controller.signal });
      controller.abort();
      await second;

      h.end();
      await first;
      expect(h.spoken.map((u) => u.text)).toEqual(['One.']);
    });

    it('resolves an already-aborted signal without speaking', async () => {
      const h = harness();
      const controller = new AbortController();
      controller.abort();
      await createSpeaker(h.deps).speak('One.', { signal: controller.signal });
      expect(h.spoken.map((u) => u.text)).toEqual([]);
    });
  });

  it('treats an utterance error as an end rather than a failure to report', async () => {
    const h = harness();
    const speaker = createSpeaker(h.deps);
    const pending = speaker.speak('One.');
    h.spoken[0]?.onerror?.();
    await expect(pending).resolves.toBeUndefined();
  });

  it('reports whether it is busy, for the filler scheduler\'s no-overlap rule', async () => {
    const h = harness();
    const speaker = createSpeaker(h.deps);
    expect(speaker.isSpeaking()).toBe(false);
    const pending = speaker.speak('One.');
    expect(speaker.isSpeaking()).toBe(true);
    h.end();
    await pending;
    expect(speaker.isSpeaking()).toBe(false);
  });
});

describe('pickVoice', () => {
  const voices = [
    voice({ voiceURI: 'a', lang: 'de-DE' }),
    voice({ voiceURI: 'b', lang: 'en-GB' }),
    voice({ voiceURI: 'c', lang: 'en-US', default: true }),
  ];

  it('honours a stored URI that still resolves', () => {
    expect(pickVoice(voices, 'b', 'en-US')?.voiceURI).toBe('b');
  });

  it('falls back rather than speaking nothing when the stored voice has vanished', () => {
    expect(pickVoice(voices, 'gone', 'en-US')?.voiceURI).toBe('c');
  });

  it('matches the exact locale, then the language, then the default', () => {
    expect(pickVoice(voices, null, 'en-GB')?.voiceURI).toBe('b');
    expect(pickVoice(voices, null, 'en-AU')?.voiceURI).toBe('b');
    expect(pickVoice(voices, null, 'fr-FR')?.voiceURI).toBe('c');
  });

  it('answers null for no voices at all — a valid state, not a failure', () => {
    expect(pickVoice([], null, 'en-US')).toBeNull();
  });
});

describe('loadCompanionVoices', () => {
  it('resolves immediately when the list is already populated', async () => {
    const { synth } = fakeSynth([voice()]);
    await expect(loadCompanionVoices(synth as unknown as SpeechSynthesis)).resolves.toHaveLength(1);
    expect(synth.addEventListener).not.toHaveBeenCalled();
  });

  /*
    The classic symptom this exists for: `getVoices()` is empty on the first
    call in Chromium and populated after `voiceschanged`, which is why a voice
    picker that reads it synchronously renders an empty list.
  */
  it('waits for voiceschanged when the first read is empty', async () => {
    let voices: SpeechSynthesisVoice[] = [];
    const listeners: (() => void)[] = [];
    const synth = {
      getVoices: () => voices,
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        listeners.push(handler);
      }),
      removeEventListener: vi.fn(),
    };

    const pending = loadCompanionVoices(synth as unknown as SpeechSynthesis);
    voices = [voice(), voice({ voiceURI: 'two' })];
    for (const fire of listeners) fire();
    await expect(pending).resolves.toHaveLength(2);
  });

  it('resolves empty on timeout rather than hanging forever', async () => {
    vi.useFakeTimers();
    try {
      const synth = {
        getVoices: () => [],
        speak: vi.fn(),
        cancel: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      const pending = loadCompanionVoices(synth as unknown as SpeechSynthesis, 2_000);
      await vi.advanceTimersByTimeAsync(2_001);
      await expect(pending).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers empty with no synth at all', async () => {
    await expect(loadCompanionVoices(null)).resolves.toEqual([]);
  });
});

describe('setCompanionLevel', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(COMPANION_LEVEL_VAR);
  });

  it('writes the clamped level onto the document root, two decimals', () => {
    setCompanionLevel(0.4567);
    expect(document.documentElement.style.getPropertyValue(COMPANION_LEVEL_VAR)).toBe('0.46');
  });

  it('clamps out-of-range values rather than emitting them', () => {
    setCompanionLevel(4);
    expect(document.documentElement.style.getPropertyValue(COMPANION_LEVEL_VAR)).toBe('1.00');
    setCompanionLevel(-2);
    expect(document.documentElement.style.getPropertyValue(COMPANION_LEVEL_VAR)).toBe('0.00');
  });
});

// --- the local voice engine (Phase 80 Theme C) ------------------------------

/** Let every pending microtask (the `synthesize`/`decodeAudioData` awaits) settle. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

type FakeSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

function fakeAudio() {
  const sources: FakeSource[] = [];
  const decodeAudioData = vi.fn(async () => ({ duration: 1 }) as unknown as AudioBuffer);
  const master = { connect: vi.fn() };
  const ctx = {
    decodeAudioData,
    createBufferSource: vi.fn((): FakeSource => {
      const source: FakeSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
  };
  return { ctx, master, sources, decodeAudioData };
}

/** Deps over a fake `AudioContext`, mirroring `harness()` above but for the local engine's port. */
function localHarness() {
  const audio = fakeAudio();
  const levels: number[] = [];
  const frames: ((now: number) => void)[] = [];
  let clock = 0;

  const deps: LocalSpeakerDeps = {
    synthesize: vi.fn(async () => ({ ok: true, audio: new Uint8Array([1, 2, 3]), mime: 'audio/wav' })),
    getAudio: () =>
      ({ ctx: audio.ctx as unknown as AudioContext, master: audio.master as unknown as GainNode }),
    hasBridge: () => true,
    setLevel: (level) => levels.push(level),
    schedule: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelScheduled: () => {},
    now: () => clock,
  };

  return {
    deps,
    audio,
    levels,
    tick: (ms: number) => {
      clock += ms;
      const pending = frames.splice(0, frames.length);
      for (const frame of pending) frame(clock);
    },
  };
}

describe('createLocalSpeaker', () => {
  it('synthesizes each chunk, plays it through the shared audio, and resolves true when it ends', async () => {
    const h = localHarness();
    const speaker = createLocalSpeaker(h.deps);

    const pending = speaker.speakLocal('Here we are.');
    await flushAsync();

    expect(h.deps.synthesize).toHaveBeenCalledWith('Here we are.');
    expect(h.audio.sources).toHaveLength(1);
    expect(h.audio.sources[0]?.connect).toHaveBeenCalledWith(h.audio.master);
    expect(h.audio.sources[0]?.start).toHaveBeenCalled();

    h.audio.sources[0]?.onended?.();
    await expect(pending).resolves.toBe(true);
  });

  it('resolves false without touching audio when the channel reports failure', async () => {
    const h = localHarness();
    const deps = { ...h.deps, synthesize: async () => ({ ok: false as const }) };
    const speaker = createLocalSpeaker(deps);

    await expect(speaker.speakLocal('hi')).resolves.toBe(false);
    expect(h.audio.sources).toHaveLength(0);
  });

  it('resolves false when there is no audio context at all', async () => {
    const h = localHarness();
    const speaker = createLocalSpeaker({ ...h.deps, getAudio: () => null });
    await expect(speaker.speakLocal('hi')).resolves.toBe(false);
  });

  it('resolves false when decoding the returned clip throws', async () => {
    const h = localHarness();
    h.audio.decodeAudioData.mockRejectedValueOnce(new Error('bad wav'));
    const speaker = createLocalSpeaker(h.deps);
    await expect(speaker.speakLocal('hi')).resolves.toBe(false);
  });

  it('reports availability from whether there is a bridge at all', () => {
    const h = localHarness();
    expect(createLocalSpeaker({ ...h.deps, hasBridge: () => true }).available).toBe(true);
    expect(createLocalSpeaker({ ...h.deps, hasBridge: () => false }).available).toBe(false);
  });

  it('speaks two queued utterances one after another, not interleaved', async () => {
    const h = localHarness();
    const speaker = createLocalSpeaker(h.deps);

    const first = speaker.speakLocal('One.');
    const second = speaker.speakLocal('Two.');
    await flushAsync();
    expect(h.audio.sources).toHaveLength(1);

    h.audio.sources[0]?.onended?.();
    await flushAsync();
    expect(h.audio.sources).toHaveLength(2);

    h.audio.sources[1]?.onended?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('pulses the level once per chunk and decays it, same shape as the system speaker', async () => {
    const h = localHarness();
    const speaker = createLocalSpeaker(h.deps);
    const pending = speaker.speakLocal('Here we are.');
    await flushAsync();

    expect(h.levels.at(-1)).toBe(1);
    h.tick(90);
    expect(h.levels.at(-1)).toBeCloseTo(0.5, 5);
    h.tick(90);
    expect(h.levels.at(-1)).toBe(0);

    h.audio.sources[0]?.onended?.();
    await pending;
  });

  it('reports whether it is busy', async () => {
    const h = localHarness();
    const speaker = createLocalSpeaker(h.deps);
    expect(speaker.isSpeaking()).toBe(false);
    const pending = speaker.speakLocal('One.');
    expect(speaker.isSpeaking()).toBe(true);
    await flushAsync();
    h.audio.sources[0]?.onended?.();
    await pending;
    expect(speaker.isSpeaking()).toBe(false);
  });

  describe('cancel', () => {
    it('stops the active source and settles every waiter true — cancelling is not a fallback trigger', async () => {
      const h = localHarness();
      const speaker = createLocalSpeaker(h.deps);
      const first = speaker.speakLocal('One.');
      const second = speaker.speakLocal('Two.');
      await flushAsync();

      speaker.cancel();

      expect(h.audio.sources[0]?.stop).toHaveBeenCalledTimes(1);
      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(speaker.isSpeaking()).toBe(false);
      expect(h.levels.at(-1)).toBe(0);
    });
  });

  describe('an abort signal', () => {
    it('stops the utterance in flight and settles it true, without disturbing the one queued behind it', async () => {
      const h = localHarness();
      const speaker = createLocalSpeaker(h.deps);
      const controller = new AbortController();

      const first = speaker.speakLocal('One.', { signal: controller.signal });
      const second = speaker.speakLocal('Two.');
      await flushAsync();

      controller.abort();
      await expect(first).resolves.toBe(true);
      expect(h.audio.sources[0]?.stop).toHaveBeenCalledTimes(1);

      await flushAsync();
      expect(h.audio.sources).toHaveLength(2);
      h.audio.sources[1]?.onended?.();
      await expect(second).resolves.toBe(true);
    });

    it('drops a queued utterance without touching the one being spoken', async () => {
      const h = localHarness();
      const speaker = createLocalSpeaker(h.deps);
      const controller = new AbortController();

      const first = speaker.speakLocal('One.');
      const second = speaker.speakLocal('Two.', { signal: controller.signal });
      await flushAsync();
      controller.abort();
      await expect(second).resolves.toBe(true);

      h.audio.sources[0]?.onended?.();
      await expect(first).resolves.toBe(true);
      expect(h.audio.sources).toHaveLength(1);
    });
  });
});

describe('createCompanionSpeaker', () => {
  it('speaks through the local engine when it succeeds, never touching the system synth', async () => {
    const local = localHarness();
    const system = harness();
    const speaker = createCompanionSpeaker({ local: local.deps, system: system.deps });

    const pending = speaker.speak('Here we are.');
    await flushAsync();
    local.audio.sources[0]?.onended?.();
    await pending;

    expect(system.spoken).toEqual([]);
  });

  it('falls back to the system engine the first time the local engine fails, and stays there', async () => {
    const local = localHarness();
    const failingSynthesize = vi.fn(async () => ({ ok: false as const }));
    const system = harness();
    const speaker = createCompanionSpeaker({
      local: { ...local.deps, synthesize: failingSynthesize },
      system: system.deps,
    });

    const first = speaker.speak('One.');
    await flushAsync();
    expect(system.spoken.map((u) => u.text)).toEqual(['One.']);
    system.end();
    await first;
    expect(failingSynthesize).toHaveBeenCalledTimes(1);

    // A second, later utterance never asks the local engine again — the
    // fallback is sticky for the object's lifetime.
    const second = speaker.speak('Two.');
    await flushAsync();
    expect(system.spoken.map((u) => u.text)).toEqual(['One.', 'Two.']);
    system.end();
    await second;
    expect(failingSynthesize).toHaveBeenCalledTimes(1);
  });

  it('cancels both engines at once', () => {
    const local = localHarness();
    const system = harness();
    const speaker = createCompanionSpeaker({ local: local.deps, system: system.deps });
    expect(() => speaker.cancel()).not.toThrow();
    expect(system.synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('reports busy while either engine is speaking', async () => {
    const local = localHarness();
    const system = harness();
    const speaker = createCompanionSpeaker({ local: local.deps, system: system.deps });

    expect(speaker.isSpeaking()).toBe(false);
    const pending = speaker.speak('Here we are.');
    expect(speaker.isSpeaking()).toBe(true);
    await flushAsync();
    local.audio.sources[0]?.onended?.();
    await pending;
    expect(speaker.isSpeaking()).toBe(false);
  });
});
