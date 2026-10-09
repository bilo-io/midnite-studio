import { describe, expect, it } from 'vitest';

import {
  MUSIC_MAX_NOTES_PER_TRACK,
  MUSIC_PPQ,
  MusicWriteRequestSchema,
  SongNameSchema,
  SongSchema,
  emptySong,
  parseAutomationTarget,
  songEndTick,
} from './media-music';

const track = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe('SongSchema (Phase 101 Theme B)', () => {
  it('fills every default for an empty song', () => {
    const song = emptySong('Demo');
    expect(song).toMatchObject({
      version: 1,
      name: 'Demo',
      ppq: MUSIC_PPQ,
      tempos: [{ tick: 0, bpm: 120 }],
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      tracks: [],
      clips: [],
      mixer: { master: { volume: 0.8, pan: 0, mute: false, solo: false } },
    });
  });

  it('defaults a track and bounds its fields', () => {
    const song = SongSchema.parse({ tracks: [track('a')] });
    expect(song.tracks[0]).toMatchObject({ channel: 0, program: 0, notes: [], automation: [], color: '#6366f1' });
    expect(SongSchema.safeParse({ tracks: [track('a', { channel: 16 })] }).success).toBe(false);
    expect(SongSchema.safeParse({ tracks: [track('a', { program: 128 })] }).success).toBe(false);
    expect(SongSchema.safeParse({ tracks: [track('a', { color: 'red' })] }).success).toBe(false);
  });

  it('rejects out-of-range notes, bends and a non-480 resolution', () => {
    const note = { pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 };
    expect(SongSchema.safeParse({ tracks: [track('a', { notes: [note] })] }).success).toBe(true);
    for (const bad of [{ pitch: 128 }, { velocity: 0 }, { durationTicks: 0 }, { startTick: -1 }, { pitch: 60.5 }]) {
      expect(SongSchema.safeParse({ tracks: [track('a', { notes: [{ ...note, ...bad }] })] }).success).toBe(false);
    }
    expect(SongSchema.safeParse({ tracks: [track('a', { pitchBends: [{ tick: 0, value: 8192 }] })] }).success).toBe(false);
    expect(SongSchema.safeParse({ ppq: 96 }).success).toBe(false);
  });

  it('caps a track at MUSIC_MAX_NOTES_PER_TRACK', () => {
    const notes = Array.from({ length: MUSIC_MAX_NOTES_PER_TRACK + 1 }, () => ({
      pitch: 60,
      startTick: 0,
      durationTicks: 1,
      velocity: 64,
    }));
    expect(SongSchema.safeParse({ tracks: [track('a', { notes })] }).success).toBe(false);
  });

  it('keeps ids unique, clips on real tracks, and the tempo map anchored at tick 0 and sorted', () => {
    expect(SongSchema.safeParse({ tracks: [track('a'), track('a')] }).success).toBe(false);
    expect(SongSchema.safeParse({ tracks: [track('a')], clips: [{ id: 'c', trackId: 'zzz', startTick: 0, lengthTicks: 480 }] }).success).toBe(false);
    expect(SongSchema.safeParse({ tracks: [track('a')], clips: [{ id: 'c', trackId: 'a', startTick: 0, lengthTicks: 480 }] }).success).toBe(true);
    expect(SongSchema.safeParse({ tempos: [{ tick: 480, bpm: 100 }] }).success).toBe(false);
    expect(
      SongSchema.safeParse({
        tempos: [
          { tick: 0, bpm: 100 },
          { tick: 960, bpm: 90 },
          { tick: 480, bpm: 95 },
        ],
      }).success,
    ).toBe(false);
    expect(SongSchema.safeParse({ tempos: [{ tick: 0, bpm: 5 }] }).success).toBe(false);
  });

  it('parses automation lanes with linear as the default curve', () => {
    const song = SongSchema.parse({
      tracks: [track('a', { automation: [{ id: 'l1', target: 'volume', points: [{ tick: 0, value: 0.5 }] }] })],
    });
    expect(song.tracks[0]!.automation[0]!.curve).toBe('linear');
  });

  it('finds the end tick', () => {
    expect(songEndTick(emptySong())).toBe(0);
    const song = SongSchema.parse({
      tracks: [track('a', { notes: [{ pitch: 60, startTick: 480, durationTicks: 960, velocity: 90 }] })],
    });
    expect(songEndTick(song)).toBe(1440);
  });

  it('keeps song names to one safe segment, and clear of the project bookkeeping file', () => {
    expect(SongNameSchema.safeParse('Night drive').success).toBe(true);
    expect(SongNameSchema.safeParse('../x').success).toBe(false);
    expect(SongNameSchema.safeParse('project').success).toBe(false);
    expect(MusicWriteRequestSchema.safeParse({ repoId: 'r', project: 'p', name: 'a', song: {} }).success).toBe(true);
  });

  describe('mixer, effects and automation (Theme F)', () => {
    const fx = { id: 'fx1', type: 'reverb' as const };

    it('an old track without effects still parses, with an empty chain', () => {
      const song = SongSchema.parse({ tracks: [track('a')] });
      expect(song.tracks[0]!.effects).toEqual([]);
      expect(song.tracks[0]!.mixer).toEqual({ volume: 0.8, pan: 0, mute: false, solo: false });
    });

    it('round-trips effects, mixer and automation through JSON unchanged', () => {
      const song = SongSchema.parse({
        tracks: [
          track('a', {
            mixer: { volume: 1.2, pan: -0.25, mute: false, solo: true },
            effects: [{ ...fx, params: { decay: 3 } }, { id: 'fx2', type: 'delay', bypass: true }],
            automation: [
              { id: 'l1', target: 'volume', curve: 'step', points: [{ tick: 0, value: 1 }] },
              { id: 'l2', target: 'fx:fx1:decay', points: [{ tick: 480, value: 2 }] },
            ],
          }),
        ],
        mixer: { master: { volume: 0.5 } },
      });
      expect(SongSchema.parse(JSON.parse(JSON.stringify(song)))).toEqual(song);
      expect(song.tracks[0]!.automation[1]!.curve).toBe('linear');
    });

    it('rejects duplicate effect ids, unknown effect types and dangling automation targets', () => {
      expect(SongSchema.safeParse({ tracks: [track('a', { effects: [fx, fx] })] }).success).toBe(false);
      expect(SongSchema.safeParse({ tracks: [track('a', { effects: [{ id: 'x', type: 'flanger' }] })] }).success).toBe(false);
      const lane = (target: string) => ({ automation: [{ id: 'l', target }] });
      expect(SongSchema.safeParse({ tracks: [track('a', lane('fx:nope:decay'))] }).success).toBe(false);
      expect(SongSchema.safeParse({ tracks: [track('a', lane('cutoff'))] }).success).toBe(false);
      expect(SongSchema.safeParse({ tracks: [track('a', { effects: [fx], ...lane('fx:fx1:decay') })] }).success).toBe(true);
    });

    it('parses automation targets', () => {
      expect(parseAutomationTarget('volume')).toEqual({ kind: 'volume' });
      expect(parseAutomationTarget('fx:a:b')).toEqual({ kind: 'effect', effectId: 'a', param: 'b' });
      expect(parseAutomationTarget('fx:a')).toBeNull();
    });
  });
});
