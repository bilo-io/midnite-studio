import { SongSchema, expandClips, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createClip, createClipFromNotes, deleteClip, duplicateClip, joinClips, moveClip, resizeClip, setClipLoop, splitClip } from './clip-edit';

const N = (startTick: number, pitch = 60) => ({ pitch, startTick, durationTicks: 100, velocity: 90 });
const base = (): Song => SongSchema.parse({ tracks: [{ id: 't', name: 'Keys', notes: [N(0), N(480), N(960), N(1440)] }] });
const plays = (s: Song) => expandClips(s).tracks[0]!.notes.map((n) => n.startTick);

describe('clip edits', () => {
  it('creates a clip around the notes, rounded to bars, which plays unchanged', () => {
    const made = createClipFromNotes(base(), 't', 1920)!;
    expect(made.song.clips[0]).toMatchObject({ startTick: 0, lengthTicks: 1920, sourceStartTick: 0, loop: false });
    expect(plays(made.song)).toEqual([0, 480, 960, 1440]);
    expect(createClipFromNotes(SongSchema.parse({ tracks: [{ id: 't' }] }), 't', 1920)).toBeNull();
  });

  it('moves, then resizes, a clip', () => {
    let s = createClip(base(), 't', 0, 1920)!.song;
    s = moveClip(s, 'clip-1', 3840);
    expect(plays(s)).toEqual([3840, 4320, 4800, 5280]);
    expect(resizeClip(s, 'clip-1', 960).clips[0]!.lengthTicks).toBe(960);
    expect(moveClip(s, 'clip-1', 3840)).toBe(s);
  });

  it('loops to fill a longer clip and trims back when looping is turned off', () => {
    const two = SongSchema.parse({ tracks: [{ id: 't', notes: [N(0), N(480)] }] });
    let s = setClipLoop(createClip(two, 't', 0, 960)!.song, 'clip-1', true);
    s = resizeClip(s, 'clip-1', 2880);
    expect(plays(s)).toEqual([0, 480, 960, 1440, 1920, 2400]);
    const off = setClipLoop(s, 'clip-1', false);
    expect(off.clips[0]).toMatchObject({ loop: false, lengthTicks: 960 });
  });

  it('splits a clip and joins it back', () => {
    const s = createClip(base(), 't', 0, 1920)!.song;
    const split = splitClip(s, 'clip-1', 960)!;
    expect(split.song.clips.map((c) => [c.startTick, c.lengthTicks, c.sourceStartTick, c.sourceLengthTicks])).toEqual([
      [0, 960, 0, 960],
      [960, 960, 960, 960],
    ]);
    expect(plays(split.song)).toEqual(plays(s));
    const joined = joinClips(split.song, 'clip-1');
    expect(joined.clips).toHaveLength(1);
    expect(joined.clips[0]).toMatchObject({ startTick: 0, lengthTicks: 1920, sourceLengthTicks: 1920 });
    expect(splitClip(s, 'clip-1', 0)).toBeNull();
  });

  it('splits a looping clip on a repeat boundary only', () => {
    let s = setClipLoop(createClip(base(), 't', 0, 960)!.song, 'clip-1', true);
    s = resizeClip(s, 'clip-1', 2880);
    expect(splitClip(s, 'clip-1', 500)).toBeNull();
    const split = splitClip(s, 'clip-1', 1500)!;
    expect(split.song.clips.map((c) => [c.startTick, c.lengthTicks])).toEqual([[0, 960], [960, 1920]]);
  });

  it('duplicates a clip after itself over the same notes, and delete frees the notes', () => {
    const s = createClip(base(), 't', 0, 1920)!.song;
    const dup = duplicateClip(s, 'clip-1')!;
    expect(plays(dup.song)).toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
    const del = deleteClip(dup.song, dup.id);
    expect(plays(del)).toEqual([0, 480, 960, 1440]);
  });
});
