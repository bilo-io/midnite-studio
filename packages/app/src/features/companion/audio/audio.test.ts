import {
  COMPANION_AUDIO_IDLE_SUSPEND_MS,
  COMPANION_WHISTLE_MELODIES,
  MELODY_REST,
  melodyDurationSeconds,
  midiToFrequency,
  type CompanionMelody,
} from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetCompanionAudioForTest,
  companionVolume,
  getCompanionAudio,
  peekCompanionAudio,
  setCompanionVolume,
  stopCompanionAudio,
  suspendCompanionAudio,
} from './context';
import {
  ELEVATOR_BARS,
  ELEVATOR_BEATS_PER_BAR,
  ELEVATOR_BPM,
  ELEVATOR_CHORDS,
  __resetElevatorForTest,
  isElevatorPlaying,
  renderElevatorLoop,
  startElevator,
  stopElevator,
} from './elevator';
import { WHISTLE_VIBRATO_HZ, __resetWhistleForTest, playWhistle, stopWhistle, whistle } from './whistle';

/**
 * Phase 79 Theme G — the synthesis layer.
 *
 * jsdom has no Web Audio at all, so everything below runs against a recording
 * fake. That is the right level: what matters is *what gets scheduled* — the
 * frequencies, the note count, the sixteen bars, the fades — and none of it
 * needs a real audio thread to be wrong.
 */

type Recorded = { kind: string; at?: number; value?: number };

/** An `AudioParam`-shaped recorder. */
function fakeParam(log: Recorded[], name: string) {
  return {
    value: 0,
    setValueAtTime: vi.fn((value: number, at: number) => {
      log.push({ kind: `${name}.setValueAtTime`, at, value });
    }),
    linearRampToValueAtTime: vi.fn((value: number, at: number) => {
      log.push({ kind: `${name}.linearRamp`, at, value });
    }),
    exponentialRampToValueAtTime: vi.fn((value: number, at: number) => {
      log.push({ kind: `${name}.expRamp`, at, value });
    }),
    cancelScheduledValues: vi.fn(),
  };
}

/** An `AudioContext`-shaped fake that records every node and every schedule. */
function fakeContext(over: { currentTime?: number; state?: string } = {}) {
  const log: Recorded[] = [];
  const oscillators: {
    type: string;
    frequency: ReturnType<typeof fakeParam>;
    detune: ReturnType<typeof fakeParam>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  }[] = [];
  const gains: { gain: ReturnType<typeof fakeParam>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const sources: { buffer: unknown; loop: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }[] = [];

  const ctx = {
    currentTime: over.currentTime ?? 0,
    sampleRate: 48_000,
    state: over.state ?? 'running',
    destination: { id: 'destination' },
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: vi.fn(() => {
      const node = { gain: fakeParam(log, 'gain'), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node = {
        type: '',
        frequency: fakeParam(log, 'freq'),
        detune: fakeParam(log, 'detune'),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      };
      oscillators.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null as unknown,
        loop: false,
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      };
      sources.push(node);
      return node;
    }),
  };

  return { ctx, log, oscillators, gains, sources };
}

afterEach(() => {
  __resetCompanionAudioForTest();
  __resetWhistleForTest();
  __resetElevatorForTest();
});

describe('the companion audio context', () => {
  it('creates nothing until the first sound', () => {
    const { ctx } = fakeContext();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    __resetCompanionAudioForTest({ create });

    expect(peekCompanionAudio()).toBeNull();
    expect(create).not.toHaveBeenCalled();

    expect(getCompanionAudio()).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reuses the one context and its one master gain', () => {
    const { ctx } = fakeContext();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    __resetCompanionAudioForTest({ create });

    const first = getCompanionAudio();
    const second = getCompanionAudio();
    expect(create).toHaveBeenCalledTimes(1);
    expect(second?.master).toBe(first?.master);
  });

  it('routes the master gain to the destination, never a source directly', () => {
    const { ctx, gains } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    getCompanionAudio();
    expect(gains[0]?.connect).toHaveBeenCalledWith(ctx.destination);
  });

  /*
    The load-bearing claim of Theme G: a silent companion costs no audio
    thread. Suspended, not closed — closing is irreversible per context and the
    next whistle would pay for a fresh graph.
  */
  it('suspends after the idle window rather than closing', () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeContext();
      __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
      getCompanionAudio();

      vi.advanceTimersByTime(COMPANION_AUDIO_IDLE_SUSPEND_MS - 1);
      expect(ctx.suspend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(ctx.suspend).toHaveBeenCalledTimes(1);
      expect(ctx.state).toBe('suspended');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the idle countdown on every sound', () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeContext();
      __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
      getCompanionAudio();

      vi.advanceTimersByTime(COMPANION_AUDIO_IDLE_SUSPEND_MS - 100);
      getCompanionAudio();
      vi.advanceTimersByTime(200);
      expect(ctx.suspend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(COMPANION_AUDIO_IDLE_SUSPEND_MS);
      expect(ctx.suspend).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes a context the browser suspended for its own reasons', () => {
    const { ctx } = fakeContext({ state: 'suspended' });
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    getCompanionAudio();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('is a no-op to suspend when there is nothing to suspend', () => {
    __resetCompanionAudioForTest({ create: null });
    expect(() => suspendCompanionAudio()).not.toThrow();
  });

  it('answers null where there is no Web Audio at all', () => {
    __resetCompanionAudioForTest({ create: null });
    expect(getCompanionAudio()).toBeNull();
  });

  describe('the volume', () => {
    it('applies to a context that does not exist yet', () => {
      const { ctx, gains } = fakeContext();
      __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

      setCompanionVolume(0.3);
      expect(companionVolume()).toBe(0.3);
      getCompanionAudio();
      expect(gains[0]?.gain.value).toBe(0.3);
    });

    it('applies to the live master node', () => {
      const { ctx, gains } = fakeContext();
      __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
      getCompanionAudio();
      setCompanionVolume(0.5);
      expect(gains[0]?.gain.value).toBe(0.5);
    });

    it('clamps rather than trusting a slider', () => {
      __resetCompanionAudioForTest({ create: null });
      setCompanionVolume(4);
      expect(companionVolume()).toBe(1);
      setCompanionVolume(-1);
      expect(companionVolume()).toBe(0);
    });
  });

  /*
    A disconnect-and-rebuild rather than a registry of live nodes: an
    oscillator with a scheduled envelope cannot be un-scheduled, and cutting
    the one node everything routes through cannot miss a source.
  */
  it('stops every sound by cutting and rebuilding the master gain', () => {
    const { ctx, gains } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    const before = getCompanionAudio();

    stopCompanionAudio();

    expect(gains[0]?.disconnect).toHaveBeenCalledTimes(1);
    const after = peekCompanionAudio();
    expect(after?.master).not.toBe(before?.master);
    // The context itself survives — this is not a close.
    expect(after?.ctx).toBe(before?.ctx);
  });

  it('keeps the volume across a stop', () => {
    const { ctx, gains } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    getCompanionAudio();
    setCompanionVolume(0.25);
    stopCompanionAudio();
    expect(gains.at(-1)?.gain.value).toBe(0.25);
  });
});

describe('playWhistle', () => {
  const melody = COMPANION_WHISTLE_MELODIES[0] as CompanionMelody;

  it('schedules one frequency per sounded note, in order, at the melody\'s tempo', () => {
    const { ctx, log } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    playWhistle(melody);

    const frequencies = log
      .filter((entry) => entry.kind === 'freq.setValueAtTime')
      .map((entry) => entry.value);
    const sounded = melody.notes.filter(([midi]) => midi !== MELODY_REST);
    expect(frequencies).toHaveLength(sounded.length);
    expect(frequencies[0]).toBeCloseTo(midiToFrequency(sounded[0]![0]), 6);
  });

  it('schedules nothing for a rest — the envelope is already at zero', () => {
    const withRest = COMPANION_WHISTLE_MELODIES.find((entry) =>
      entry.notes.some(([midi]) => midi === MELODY_REST),
    ) as CompanionMelody;
    const { ctx, log } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    playWhistle(withRest);
    const frequencies = log.filter((entry) => entry.kind === 'freq.setValueAtTime');
    expect(frequencies.map((entry) => entry.value)).not.toContain(0);
  });

  /*
    Two oscillators, because one is a test tone. The second drives `detune` —
    cents, not hertz, so the wobble reads identically high and low.
  */
  it('builds a vibrato oscillator into detune, not into frequency', () => {
    const { ctx, oscillators, log } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    playWhistle(melody);

    expect(oscillators).toHaveLength(2);
    expect(oscillators[0]?.type).toBe('sine');
    expect(oscillators[1]?.frequency.value).toBe(WHISTLE_VIBRATO_HZ);
    expect(oscillators[1]?.connect).toHaveBeenCalled();
    expect(log.some((entry) => entry.kind === 'detune.setValueAtTime')).toBe(false);
  });

  it('starts in the future so the first attack is not clamped to full volume', () => {
    const { ctx, oscillators } = fakeContext({ currentTime: 10 });
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    playWhistle(melody);
    const startedAt = oscillators[0]?.start.mock.calls[0]?.[0] as number;
    expect(startedAt).toBeGreaterThan(10);
  });

  it('stops both oscillators past the melody\'s own length', () => {
    const { ctx, oscillators } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    playWhistle(melody);
    const stoppedAt = oscillators[0]?.stop.mock.calls[0]?.[0] as number;
    expect(stoppedAt).toBeGreaterThanOrEqual(melodyDurationSeconds(melody));
    expect(oscillators[1]?.stop).toHaveBeenCalled();
  });

  it('answers null where there is no audio, rather than throwing', () => {
    __resetCompanionAudioForTest({ create: null });
    expect(playWhistle(melody)).toBeNull();
  });

  it('ramps down rather than cutting a sine mid-cycle', () => {
    const { ctx, log, oscillators } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    const handle = playWhistle(melody);
    const rampsBefore = log.filter((entry) => entry.kind === 'gain.linearRamp').length;
    handle?.stop();

    expect(log.filter((entry) => entry.kind === 'gain.linearRamp').length).toBeGreaterThan(
      rampsBefore,
    );
    expect(oscillators[0]?.stop).toHaveBeenCalledTimes(2);
  });

  it('is safe to stop twice', () => {
    const { ctx } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    const handle = playWhistle(melody);
    handle?.stop();
    expect(() => handle?.stop()).not.toThrow();
  });
});

describe('whistle', () => {
  it('never plays the same melody twice in a row', () => {
    const { ctx, oscillators } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    /** Sounded notes in melody `index` — the fingerprint that identifies it. */
    const sounded = (index: number): number =>
      (COMPANION_WHISTLE_MELODIES[index] as CompanionMelody).notes.filter(
        ([midi]) => midi !== MELODY_REST,
      ).length;

    // A degenerate rng that would otherwise pick index 0 every single time.
    whistle(() => 0);
    expect(oscillators[0]?.frequency.setValueAtTime.mock.calls).toHaveLength(sounded(0));

    const before = oscillators.length;
    whistle(() => 0);
    // Index 1, not 0 again: the picker steps forward on a collision.
    expect(oscillators[before]?.frequency.setValueAtTime.mock.calls).toHaveLength(sounded(1));
    expect(sounded(0)).not.toBe(sounded(1));
  });

  it('stops whatever was playing before starting the next', () => {
    const { ctx, oscillators } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });

    whistle(() => 0);
    const first = oscillators[0];
    whistle(() => 0.4);
    expect(first?.stop).toHaveBeenCalledTimes(2);
  });

  it('is safe to stop when nothing is whistling', () => {
    expect(() => stopWhistle()).not.toThrow();
  });
});

describe('renderElevatorLoop', () => {
  /** An `OfflineAudioContext`-shaped fake. */
  function fakeOffline(sampleRate = 48_000) {
    const inner = fakeContext();
    const buffers: { length: number }[] = [];
    const filters: { type: string; frequency: { value: number }; connect: ReturnType<typeof vi.fn> }[] = [];
    const rendered = { length: 1 } as AudioBuffer;
    let requested = { channels: 0, length: 0, sampleRate: 0 };

    const create = (channels: number, length: number, rate: number) => {
      requested = { channels, length, sampleRate: rate };
      return {
        ...inner.ctx,
        sampleRate: rate,
        createBuffer: vi.fn((_channels: number, len: number) => {
          const buffer = { length: len, getChannelData: () => new Float32Array(len) };
          buffers.push(buffer);
          return buffer as unknown as AudioBuffer;
        }),
        createBiquadFilter: vi.fn(() => {
          const node = { type: '', frequency: { value: 0 }, connect: vi.fn() };
          filters.push(node);
          return node;
        }),
        startRendering: vi.fn(async () => rendered),
      } as unknown as OfflineAudioContext;
    };

    return { create, inner, buffers, filters, requested: () => requested, sampleRate };
  }

  it('renders exactly sixteen bars at its own tempo', async () => {
    const offline = fakeOffline();
    await renderElevatorLoop(48_000, offline.create);

    const expectedSeconds = (60 / ELEVATOR_BPM) * ELEVATOR_BEATS_PER_BAR * ELEVATOR_BARS;
    expect(offline.requested().length).toBe(Math.ceil(expectedSeconds * 48_000));
    expect(offline.requested().channels).toBe(1);
  });

  it('schedules five voices per bar, alternating the two chords', async () => {
    const offline = fakeOffline();
    await renderElevatorLoop(48_000, offline.create);

    const voices = offline.inner.oscillators;
    const perBar = (ELEVATOR_CHORDS[0] as readonly number[]).length;
    expect(voices).toHaveLength(perBar * ELEVATOR_BARS);
    for (const voice of voices) expect(voice.type).toBe('triangle');

    // The second bar's first voice is the second chord's lowest note.
    expect(voices[perBar]?.frequency.value).toBeCloseTo(
      midiToFrequency((ELEVATOR_CHORDS[1] as readonly number[])[0]!),
      4,
    );
  });

  it('puts one lowpassed brush on beats 2 and 4 of every bar', async () => {
    const offline = fakeOffline();
    await renderElevatorLoop(48_000, offline.create);

    expect(offline.inner.sources).toHaveLength(2 * ELEVATOR_BARS);
    expect(offline.filters).toHaveLength(2 * ELEVATOR_BARS);
    for (const filter of offline.filters) {
      expect(filter.type).toBe('lowpass');
      // A brush, not a hi-hat: well below the noise's own spectrum.
      expect(filter.frequency.value).toBeLessThan(3_000);
    }
  });

  it('generates the noise once and reuses it for every brush', async () => {
    const offline = fakeOffline();
    await renderElevatorLoop(48_000, offline.create);
    expect(offline.buffers).toHaveLength(1);
  });
});

describe('startElevator / stopElevator', () => {
  function elevatorHarness() {
    const { ctx, gains, sources, log } = fakeContext();
    __resetCompanionAudioForTest({ create: () => ctx as unknown as AudioContext });
    const rendered = { length: 1 } as AudioBuffer;
    const createOffline = vi.fn(
      () =>
        ({
          sampleRate: 48_000,
          destination: {},
          createBuffer: () => ({ getChannelData: () => new Float32Array(8) }) as unknown as AudioBuffer,
          createOscillator: () => ({
            type: '',
            frequency: { value: 0 },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          }),
          createGain: () => ({
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          }),
          createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: vi.fn() }),
          createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect: vi.fn() }),
          startRendering: async () => rendered,
        }) as unknown as OfflineAudioContext,
    );
    __resetElevatorForTest({ createOffline });
    return { ctx, gains, sources, log, createOffline };
  }

  it('loops one buffer source, fading in', async () => {
    const h = elevatorHarness();
    await startElevator();

    expect(h.sources).toHaveLength(1);
    expect(h.sources[0]?.loop).toBe(true);
    expect(h.sources[0]?.start).toHaveBeenCalledTimes(1);
    expect(isElevatorPlaying()).toBe(true);
    // A ramp up to 1 — music that starts at volume is a jump-scare.
    expect(h.log.some((entry) => entry.kind === 'gain.linearRamp' && entry.value === 1)).toBe(true);
  });

  /*
    Rendered once is the point: a live graph re-scheduling four voices a bar
    for as long as an agent runs is exactly the idle cost this theme answers
    for, and a re-scheduled bar drifts by the timer's jitter.
  */
  it('renders the loop once and reuses the buffer on a restart', async () => {
    const h = elevatorHarness();
    await startElevator();
    stopElevator();
    await startElevator();
    expect(h.createOffline).toHaveBeenCalledTimes(1);
    expect(h.sources).toHaveLength(2);
  });

  it('is idempotent while already playing', async () => {
    const h = elevatorHarness();
    await startElevator();
    await startElevator();
    expect(h.sources).toHaveLength(1);
  });

  it('fades out and stops, and reports itself stopped immediately', async () => {
    const h = elevatorHarness();
    await startElevator();
    stopElevator();

    expect(isElevatorPlaying()).toBe(false);
    expect(h.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(h.log.some((entry) => entry.kind === 'gain.linearRamp' && entry.value === 0)).toBe(true);
  });

  it('is safe to stop when nothing is playing', () => {
    elevatorHarness();
    expect(() => stopElevator()).not.toThrow();
  });

  it('stays silent with no audio context at all', async () => {
    __resetCompanionAudioForTest({ create: null });
    __resetElevatorForTest();
    await startElevator();
    expect(isElevatorPlaying()).toBe(false);
  });
});
