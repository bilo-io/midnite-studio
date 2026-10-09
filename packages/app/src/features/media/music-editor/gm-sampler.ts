import { GM_DRUM_CHANNEL, GM_DRUM_KIT, type GmDrumVoice, type MidniteStudioBridge } from '@midnite/studio-shared';

/**
 * The per-track General MIDI instrument factory (Phase 101 Theme D).
 *
 * **Tone.js is loaded lazily.** This module never imports `tone` at the top level — only
 * `import('tone')` inside {@link createGmInstrument} — so the entry chunk does not grow and Tone
 * lands in its own lazy chunk, fetched when the Editor first builds an instrument.
 *
 * - Channel 10 (`GM_DRUM_CHANNEL`) is the drum kit: synthesised, never needs a download.
 * - Any other program tries `Tone.Sampler` over the program's cached FluidR3_GM samples.
 * - If the samples are not on disk (offline, not downloaded yet) it falls back to a Tone synth and
 *   reports `missing: true`, so the UI can show a "not downloaded" hint — never silence.
 */

export type GmInstrumentSource = 'sampler' | 'synth-fallback' | 'drum-kit';

export type GmInstrument = {
  source: GmInstrumentSource;
  /** True when a sampled program could not be loaded and a synth stands in for it. */
  missing: boolean;
  /** `note` is a name (`C4`) or a MIDI number; `time` is Tone transport/context time. */
  triggerAttackRelease: (note: string | number, duration: number | string, time?: number, velocity?: number) => void;
  /** Connect to a Tone node (mixer channel strip, effects, destination). */
  connect: (destination: unknown) => void;
  dispose: () => void;
};

type ToneModule = typeof import('tone');
type GmBridge = Pick<MidniteStudioBridge['media']['audio'], 'gm'>;

export type CreateGmInstrumentOptions = {
  /** GM program 0-127 (ignored on the drum channel). */
  program: number;
  /** 0-based MIDI channel; 9 is the drum kit. */
  channel?: number;
  bridge?: GmBridge;
  /** Test seam; defaults to a dynamic `import('tone')`. */
  loadTone?: () => Promise<ToneModule>;
};

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const defaultLoadTone = (): Promise<ToneModule> => import('tone');

function toDestination(node: unknown, destination: unknown): void {
  (node as { connect: (d: unknown) => void }).connect(destination);
}

function createDrumKit(Tone: ToneModule): GmInstrument {
  const out = new Tone.Gain(1);
  const voices: Record<GmDrumVoice, { play: (time: number, velocity: number) => void; dispose: () => void }> = {
    kick: (() => {
      const synth = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6 }).connect(out);
      return { play: (t, v) => synth.triggerAttackRelease('C1', '8n', t, v), dispose: () => synth.dispose() };
    })(),
    snare: (() => {
      const noise = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(out);
      return { play: (t, v) => noise.triggerAttackRelease('16n', t, v), dispose: () => noise.dispose() };
    })(),
    hat: (() => {
      const metal = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, resonance: 4000, octaves: 1.5 }).connect(out);
      metal.frequency.value = 400;
      return { play: (t, v) => metal.triggerAttackRelease('32n', t, v), dispose: () => metal.dispose() };
    })(),
    tom: (() => {
      const synth = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3 }).connect(out);
      return { play: (t, v) => synth.triggerAttackRelease('G2', '8n', t, v), dispose: () => synth.dispose() };
    })(),
    cymbal: (() => {
      const metal = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.8, release: 0.3 }, harmonicity: 5.1, resonance: 5000, octaves: 1.5 }).connect(out);
      metal.frequency.value = 250;
      return { play: (t, v) => metal.triggerAttackRelease('4n', t, v), dispose: () => metal.dispose() };
    })(),
    perc: (() => {
      const synth = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2 }).connect(out);
      return { play: (t, v) => synth.triggerAttackRelease('C4', '32n', t, v), dispose: () => synth.dispose() };
    })(),
  };
  const voiceByNote = new Map(GM_DRUM_KIT.map((drum) => [drum.note, drum.voice]));
  return {
    source: 'drum-kit',
    missing: false,
    triggerAttackRelease: (note, _duration, time, velocity = 0.8) => {
      const midi = typeof note === 'number' ? note : Tone.Frequency(note).toMidi();
      const voice = voiceByNote.get(midi);
      if (voice) voices[voice].play(time ?? Tone.now(), velocity);
    },
    connect: (destination) => toDestination(out, destination),
    dispose: () => {
      for (const voice of Object.values(voices)) voice.dispose();
      out.dispose();
    },
  };
}

function createSynthFallback(Tone: ToneModule): GmInstrument {
  const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' } });
  return {
    source: 'synth-fallback',
    missing: true,
    triggerAttackRelease: (note, duration, time, velocity) =>
      synth.triggerAttackRelease(typeof note === 'number' ? Tone.Frequency(note, 'midi').toNote() : note, duration, time, velocity),
    connect: (destination) => toDestination(synth, destination),
    dispose: () => synth.dispose(),
  };
}

async function createSampler(Tone: ToneModule, notes: Record<string, string>): Promise<GmInstrument> {
  const context = Tone.getContext().rawContext as BaseAudioContext;
  const entries = await Promise.all(
    Object.entries(notes).map(async ([note, base64]) => [note, await context.decodeAudioData(base64ToArrayBuffer(base64))] as const),
  );
  const urls = Object.fromEntries(entries.map(([note, buffer]) => [note, buffer]));
  const sampler = new Tone.Sampler({ urls });
  await Tone.loaded();
  return {
    source: 'sampler',
    missing: false,
    triggerAttackRelease: (note, duration, time, velocity) =>
      sampler.triggerAttackRelease(typeof note === 'number' ? Tone.Frequency(note, 'midi').toNote() : note, duration, time, velocity),
    connect: (destination) => toDestination(sampler, destination),
    dispose: () => sampler.dispose(),
  };
}

/** Builds one track's instrument. Never throws: any failure degrades to the synth fallback. */
export async function createGmInstrument(options: CreateGmInstrumentOptions): Promise<GmInstrument> {
  const Tone = await (options.loadTone ?? defaultLoadTone)();
  if (options.channel === GM_DRUM_CHANNEL) return createDrumKit(Tone);
  try {
    const result = await options.bridge?.gm.load({ program: options.program });
    if (result?.ok && Object.keys(result.value.notes).length > 0) return await createSampler(Tone, result.value.notes);
  } catch {
    // fall through to the synth
  }
  return createSynthFallback(Tone);
}
