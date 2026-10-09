import { describe, expect, it } from 'vitest';

import { SongSchema, type Song } from './media-music';
import { expandClips } from './media-music-clips';
import { sliceSong } from './media-music-export';

const song = (clips: unknown[], notes: unknown[]): Song =>
  SongSchema.parse({ tracks: [{ id: 't1', notes }, { id: 't2', notes: [{ pitch: 1, startTick: 0, durationTicks: 10, velocity: 50 }] }], clips });
const n = (startTick: number, pitch = 60, durationTicks = 100) => ({ pitch, startTick, durationTicks, velocity: 90 });
const starts = (s: Song) => s.tracks[0]!.notes.map((x) => x.startTick);

describe('expandClips', () => {
  it('returns the same song when there are no clips', () => {
    const s = song([], [n(0)]);
    expect(expandClips(s)).toBe(s);
  });

  it('plays owned notes at the clip position and leaves other notes alone', () => {
    const s = song([{ id: 'c', trackId: 't1', startTick: 960, lengthTicks: 480, sourceStartTick: 0 }], [n(0), n(240), n(480, 62)]);
    const out = expandClips(s);
    expect(out.clips).toEqual([]);
    expect(starts(out)).toEqual([480, 960, 1200]);
    expect(out.tracks[1]).toBe(s.tracks[1]);
  });

  it('repeats the source while a looping clip has room and cuts the last note at the clip end', () => {
    const s = song(
      [{ id: 'c', trackId: 't1', startTick: 480, lengthTicks: 1000, sourceStartTick: 0, sourceLengthTicks: 480, loop: true }],
      [n(0, 60, 100), n(400, 62, 200)],
    );
    const out = expandClips(s).tracks[0]!.notes;
    expect(out.map((x) => x.startTick)).toEqual([480, 880, 960, 1360, 1440]);
    expect(out[3]).toMatchObject({ startTick: 1360, durationTicks: 120 });
  });

  it('plays a non-looping clip once even when it is longer than its source', () => {
    const s = song([{ id: 'c', trackId: 't1', startTick: 0, lengthTicks: 2000, sourceStartTick: 0, sourceLengthTicks: 480 }], [n(0), n(100)]);
    expect(starts(expandClips(s))).toEqual([0, 100]);
  });

  it('plays a source range twice when two clips share it', () => {
    const s = song(
      [
        { id: 'a', trackId: 't1', startTick: 0, lengthTicks: 480, sourceStartTick: 0 },
        { id: 'b', trackId: 't1', startTick: 960, lengthTicks: 480, sourceStartTick: 0 },
      ],
      [n(0), n(240)],
    );
    expect(starts(expandClips(s))).toEqual([0, 240, 960, 1200]);
  });

  it('feeds sliceSong the expanded notes', () => {
    const s = song([{ id: 'c', trackId: 't1', startTick: 960, lengthTicks: 480, sourceStartTick: 0 }], [n(0)]);
    expect(starts(sliceSong(s, { startTick: 960, endTick: 1440 }))).toEqual([0]);
  });
});
