import type { MidniteStudioBridge, SongTrack } from '@midnite/studio-shared';

import { createGmInstrument } from '../gm-sampler';
import type { EngineHost, InstrumentHandle } from './engine';
import type { ScheduledNote } from './scheduler';

type ToneModule = typeof import('tone');
type GmBridge = Pick<MidniteStudioBridge['media']['audio'], 'gm'>;

/** Loaded on first use, never at module scope: this is the only place the engine reaches Tone. */
export const loadTone = (): Promise<ToneModule> => import('tone');

export async function makeGmInstrument(
  track: SongTrack,
  bridge: GmBridge | undefined,
  tone: ToneModule,
): Promise<InstrumentHandle> {
  const gm = await createGmInstrument({
    program: track.program,
    channel: track.channel,
    bridge,
    loadTone: async () => tone,
  });
  gm.connect(tone.getDestination());
  return {
    missing: gm.missing,
    play: (note: ScheduledNote, time: number) =>
      gm.triggerAttackRelease(note.pitch, note.duration, time, note.velocity),
    dispose: () => gm.dispose(),
  };
}

/** The Tone.js adapter for {@link EngineHost}. Transport is pinned to 60 BPM: see engine.ts. */
export async function createToneHost(bridge?: GmBridge): Promise<EngineHost> {
  const Tone = await loadTone();
  const transport = Tone.getTransport();
  transport.bpm.value = 60;
  const click = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume: -12,
  }).toDestination();
  return {
    resumeContext: async () => {
      await Tone.start();
    },
    suspendContext: async () => {
      await Tone.getContext().rawContext.suspend?.();
    },
    transport: {
      start: () => transport.start(),
      pause: () => transport.pause(),
      stop: () => transport.stop(),
      get seconds() {
        return transport.seconds;
      },
      set seconds(value: number) {
        transport.seconds = value;
      },
      get loop() {
        return transport.loop as boolean;
      },
      set loop(value: boolean) {
        transport.loop = value;
      },
      setLoopPoints: (start, end) => transport.setLoopPoints(start, end),
    },
    createInstrument: (track) => makeGmInstrument(track, bridge, Tone),
    schedulePart: (events, fire) => {
      const part = new Tone.Part<ScheduledNote>(
        (time, note) => fire(note, time),
        events.map((e) => [e.time, e] as [number, ScheduledNote]),
      );
      part.start(0);
      return { dispose: () => part.dispose() };
    },
    scheduleClicks: (clicks) => {
      const part = new Tone.Part<{ accent: boolean }>(
        (time, c) => click.triggerAttackRelease(c.accent ? 'C6' : 'G5', '32n', time),
        clicks.map((c) => [c.time, { accent: c.accent }] as [number, { accent: boolean }]),
      );
      part.start(0);
      return { dispose: () => part.dispose() };
    },
    dispose: () => {
      transport.stop();
      transport.cancel();
      click.dispose();
    },
  };
}
