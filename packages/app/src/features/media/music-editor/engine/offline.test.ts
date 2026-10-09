import { SongSchema } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { renderSongToWav } from './offline';

// Fake Tone: only the offline plumbing is under test, not audio.
function fakeTone() {
  const parts: unknown[][] = [];
  const node = () => {
    const self = {
      connect: vi.fn(() => self),
      dispose: vi.fn(),
      triggerAttackRelease: vi.fn(),
      toDestination: vi.fn(() => self),
    };
    return self;
  };
  return {
    parts,
    Tone: {
      Gain: vi.fn(node),
      PolySynth: vi.fn(node),
      Synth: vi.fn(),
      getDestination: () => ({}),
      Frequency: () => ({ toNote: () => 'C4', toMidi: () => 60 }),
      Part: vi.fn((_cb: unknown, events: unknown[]) => {
        parts.push(events);
        return { start: vi.fn() };
      }),
      Offline: vi.fn(
        async (
          cb: (ctx: { transport: { bpm: { value: number }; start: () => void } }) => Promise<void>,
          duration: number,
          _ch: number,
          rate: number,
        ) => {
          await cb({ transport: { bpm: { value: 0 }, start: vi.fn() } });
          const frames = Math.ceil(duration * rate);
          return { numberOfChannels: 2, getChannelData: () => new Float32Array(frames) };
        },
      ),
    },
  };
}

describe('renderSongToWav', () => {
  it('renders audible tracks over the tempo-mapped duration plus the tail', async () => {
    const { Tone, parts } = fakeTone();
    const song = SongSchema.parse({
      tempos: [{ tick: 0, bpm: 60 }],
      tracks: [
        { id: 'a', notes: [{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 }] },
        {
          id: 'muted',
          mixer: { mute: true },
          notes: [{ pitch: 62, startTick: 0, durationTicks: 480, velocity: 100 }],
        },
      ],
    });
    const result = await renderSongToWav(song, {
      loadTone: async () => Tone as never,
      sampleRate: 8000,
      tailSeconds: 0.5,
    });
    expect(parts).toHaveLength(1);
    expect(result.durationSeconds).toBeCloseTo(1.5);
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('RIFF');
    expect(result.bytes.length).toBe(44 + Math.ceil(1.5 * 8000) * 4);
  });
});
