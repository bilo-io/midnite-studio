import { describe, expect, it } from 'vitest';

import { MEDIA_AUDIO_EDITOR_EXPORT_FORMATS, MEDIA_EXPORT_FORMAT_INFO } from './media';
import { MUSIC_PPQ, SongSchema } from './media-music';
import {
  MUSIC_EXPORT_FORMATS,
  MusicExportRequestSchema,
  describeSong,
  detectKey,
  sliceSong,
} from './media-music-export';

const note = (pitch: number, beat: number, beats = 1) => ({
  pitch,
  startTick: beat * MUSIC_PPQ,
  durationTicks: beats * MUSIC_PPQ,
  velocity: 90,
});

const song = SongSchema.parse({
  name: 'Demo',
  tempos: [{ tick: 0, bpm: 100 }, { tick: 4 * MUSIC_PPQ, bpm: 140 }],
  tracks: [
    { id: 'p', name: 'Piano', program: 0, notes: [60, 62, 64, 65, 67, 69, 71, 72].map((p, i) => note(p, i)) },
    { id: 'd', name: 'Drums', channel: 9, notes: [note(36, 0), note(38, 1)] },
  ],
});

describe('export format plumbing', () => {
  it('lists .mid, WAV and MP3, all known to the format table', () => {
    expect([...MUSIC_EXPORT_FORMATS]).toEqual(['mid', 'wav', 'mp3']);
    expect([...MEDIA_AUDIO_EDITOR_EXPORT_FORMATS]).toEqual(['mid', 'wav', 'mp3']);
    expect(MEDIA_EXPORT_FORMAT_INFO.mid).toEqual({ label: 'MIDI', ext: 'mid', needsFfmpeg: false });
    expect(MEDIA_EXPORT_FORMAT_INFO.wav.needsFfmpeg).toBe(true);
  });

  it('accepts a request with a rendered wav and rejects an unknown format', () => {
    const base = { repoId: 'r', project: 'album', name: 'Demo', exportId: 'e1', song };
    expect(MusicExportRequestSchema.safeParse({ ...base, format: 'wav', wav: new Uint8Array(4) }).success).toBe(true);
    expect(MusicExportRequestSchema.safeParse({ ...base, format: 'flac' }).success).toBe(false);
  });
});

describe('sliceSong', () => {
  it('returns the song untouched without a region', () => {
    expect(sliceSong(song, null)).toBe(song);
  });

  it('moves the window to tick 0, clips notes and keeps the tempo in force', () => {
    const cut = sliceSong(song, { startTick: 3 * MUSIC_PPQ + MUSIC_PPQ / 2, endTick: 6 * MUSIC_PPQ });
    expect(cut.tempos).toEqual([{ tick: 0, bpm: 100 }, { tick: MUSIC_PPQ / 2, bpm: 140 }]);
    const piano = cut.tracks[0]!.notes;
    // beat 3 note (4 → 65? index 3) is clipped to begin at the window; beat 6+ is dropped.
    expect(piano[0]).toMatchObject({ pitch: 65, startTick: 0, durationTicks: MUSIC_PPQ / 2 });
    expect(piano.at(-1)).toMatchObject({ pitch: 69, startTick: 5 * MUSIC_PPQ - 3 * MUSIC_PPQ - MUSIC_PPQ / 2 });
    expect(piano.every((n) => n.startTick + n.durationTicks <= 6 * MUSIC_PPQ - 3 * MUSIC_PPQ - MUSIC_PPQ / 2)).toBe(true);
    expect(cut.clips).toEqual([]);
  });
});

describe('describeSong', () => {
  it('is deterministic and names key, tempo, instruments and mood', () => {
    const a = describeSong(song);
    expect(describeSong(song)).toEqual(a);
    expect(a.key).toEqual({ key: 'C', scale: 'major' });
    expect(a.bpm).toBe(100);
    expect(a.instruments).toEqual(['Acoustic Grand Piano', 'Drum kit']);
    expect(a.mood).toBe('relaxed, bright');
    expect(a.text).toBe('Instrumental, relaxed, bright mood, C major, 100 BPM in 4/4, played on Acoustic Grand Piano, Drum kit.');
    expect(a.text.length).toBeLessThanOrEqual(400);
    expect(a.tags.every((t) => t.length <= 40)).toBe(true);
  });

  it('prefers a declared key signature and copes with an empty song', () => {
    const declared = SongSchema.parse({ keySignatures: [{ tick: 0, key: 'A', scale: 'minor' }] });
    expect(detectKey(declared)).toEqual({ key: 'A', scale: 'minor' });
    expect(describeSong(SongSchema.parse({})).text).toContain('no instruments');
  });
});
