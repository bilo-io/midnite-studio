import { midiToFrequency } from '@midnite/studio-shared';

import { getCompanionAudio, noteCompanionAudioActivity, peekCompanionAudio } from './context';

/**
 * Sixteen bars of elevator music, rendered once and looped (Phase 79 Theme G).
 *
 * The shape is from the phase doc: two triangle-wave chords and a soft
 * filtered-noise brush on beats 2 and 4, rendered *once* with an
 * `OfflineAudioContext` into a buffer and then played by a single
 * `AudioBufferSourceNode` with `loop = true`.
 *
 * **Rendered once is the whole point.** A live graph re-scheduling four voices
 * every bar for as long as an agent runs is precisely the idle cost this theme
 * has to answer for; a looping buffer source is one node that the audio thread
 * reads from a fixed array. It is also the only way the loop is seamless — a
 * re-scheduled bar drifts by whatever the timer's jitter was.
 *
 * Fades in over 2 s and out over 1 s, per the doc, because music that starts at
 * volume is a jump-scare and music that stops dead sounds like a crash.
 *
 * Nothing here is an asset: the chords are MIDI numbers and the brush is
 * `Math.random()` through a lowpass. That is the phase's "no audio assets"
 * guardrail, honoured the same way the whistle melodies are.
 */

export const ELEVATOR_BPM = 76;
export const ELEVATOR_BARS = 16;
export const ELEVATOR_BEATS_PER_BAR = 4;
export const ELEVATOR_FADE_IN_S = 2;
export const ELEVATOR_FADE_OUT_S = 1;

/**
 * Two chords, alternating a bar each: A minor 9 and F major 9 (voiced high, no
 * root doubling). A ii–V-ish pair that resolves to neither, which is what
 * makes it wallpaper rather than a tune — the phase asks for something
 * forgettable on purpose.
 */
export const ELEVATOR_CHORDS: readonly (readonly number[])[] = [
  [57, 60, 64, 67, 71], // A3 C4 E4 G4 B4
  [53, 57, 60, 64, 67], // F3 A3 C4 E4 G4
];

/** Per-voice gain. Five voices at once, so each one is quiet. */
const VOICE_PEAK = 0.045;
const BRUSH_PEAK = 0.05;

export type OfflineContextFactory = (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

/**
 * Render the loop.
 *
 * Exported so it is testable against a fake offline context without going near
 * playback — the interesting properties (the length is exactly sixteen bars,
 * the chords alternate, the brush lands on 2 and 4) are all about what gets
 * scheduled.
 */
export async function renderElevatorLoop(
  sampleRate: number,
  createOffline: OfflineContextFactory,
): Promise<AudioBuffer> {
  const secondsPerBeat = 60 / ELEVATOR_BPM;
  const barSeconds = secondsPerBeat * ELEVATOR_BEATS_PER_BAR;
  const totalSeconds = barSeconds * ELEVATOR_BARS;
  const offline = createOffline(1, Math.ceil(totalSeconds * sampleRate), sampleRate);

  /*
    One noise buffer, reused by every brush. Generating 64 short noise buffers
    would be 64 allocations for a sound nobody can tell apart from one.
  */
  const brushSeconds = 0.18;
  const noise = offline.createBuffer(1, Math.ceil(brushSeconds * sampleRate), sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;

  for (let bar = 0; bar < ELEVATOR_BARS; bar += 1) {
    const barAt = bar * barSeconds;
    const chord = ELEVATOR_CHORDS[bar % ELEVATOR_CHORDS.length] as readonly number[];

    for (const midi of chord) {
      const voice = offline.createOscillator();
      voice.type = 'triangle';
      voice.frequency.value = midiToFrequency(midi);
      const gain = offline.createGain();
      gain.gain.setValueAtTime(0, barAt);
      // A whole-bar swell and release, so the chords breathe into each other
      // rather than being cut and pasted.
      gain.gain.linearRampToValueAtTime(VOICE_PEAK, barAt + barSeconds * 0.25);
      gain.gain.setValueAtTime(VOICE_PEAK, barAt + barSeconds * 0.7);
      gain.gain.linearRampToValueAtTime(0, barAt + barSeconds);
      voice.connect(gain);
      gain.connect(offline.destination);
      voice.start(barAt);
      voice.stop(barAt + barSeconds);
    }

    // Beats 2 and 4 — the backbeat, one-indexed as a musician counts them.
    for (const beat of [1, 3]) {
      const at = barAt + beat * secondsPerBeat;
      const source = offline.createBufferSource();
      source.buffer = noise;
      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      // Well below the noise's own spectrum: what is wanted is a brush, not a
      // hi-hat, and unfiltered white noise is the latter.
      filter.frequency.value = 1_400;
      const gain = offline.createGain();
      gain.gain.setValueAtTime(BRUSH_PEAK, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + brushSeconds);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(offline.destination);
      source.start(at);
    }
  }

  return offline.startRendering();
}

export type ElevatorDeps = { createOffline: OfflineContextFactory | null };

export const defaultElevatorDeps = (): ElevatorDeps => ({
  createOffline:
    typeof OfflineAudioContext === 'function'
      ? (channels, length, sampleRate) => new OfflineAudioContext(channels, length, sampleRate)
      : null,
});

let deps: ElevatorDeps = defaultElevatorDeps();
let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let fade: GainNode | null = null;
/** The render is a promise; two starts in a row must not render twice. */
let rendering: Promise<AudioBuffer> | null = null;

/**
 * Start the loop, fading in.
 *
 * Idempotent: a second call while it is already playing does nothing rather
 * than layering a second copy — the music offer can only be accepted once per
 * hand-off, but a state change firing twice must not be audible.
 */
export async function startElevator(): Promise<void> {
  if (source !== null) return;
  const audio = getCompanionAudio();
  if (audio === null || deps.createOffline === null) return;

  const { ctx, master } = audio;
  if (buffer === null) {
    rendering ??= renderElevatorLoop(ctx.sampleRate, deps.createOffline);
    try {
      buffer = await rendering;
    } catch {
      // A refused offline render (an embedder without it) is silence, not an
      // error to report: this is elevator music.
      rendering = null;
      return;
    }
    rendering = null;
  }
  // The await above yields, so a `stopElevator()` may have landed meanwhile.
  if (source !== null) return;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + ELEVATOR_FADE_IN_S);
  gain.connect(master);

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(gain);
  node.start();

  source = node;
  fade = gain;
  noteCompanionAudioActivity();
}

/**
 * Fade out over a second and stop.
 *
 * The node is detached from module state *first*, so a `startElevator()`
 * arriving during the fade builds a fresh one rather than being refused by a
 * loop that is on its way out.
 */
export function stopElevator(): void {
  const node = source;
  const gain = fade;
  source = null;
  fade = null;
  if (node === null) return;

  const ctx = peekCompanionAudio()?.ctx;
  try {
    if (gain !== null && ctx !== undefined) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + ELEVATOR_FADE_OUT_S);
      node.stop(ctx.currentTime + ELEVATOR_FADE_OUT_S + 0.05);
      return;
    }
    node.stop();
  } catch {
    // Already stopped. Nothing to do.
  }
}

export function isElevatorPlaying(): boolean {
  return source !== null;
}

/** Reset module state. Tests only. */
export function __resetElevatorForTest(overrides: Partial<ElevatorDeps> = {}): void {
  source = null;
  fade = null;
  buffer = null;
  rendering = null;
  deps = { ...defaultElevatorDeps(), ...overrides };
}
