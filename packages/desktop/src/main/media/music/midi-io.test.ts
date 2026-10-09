import { Midi } from '@tonejs/midi';
import { SongSchema, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { midiToSong, songToMidi } from './midi-io';

const baseTrack = {
  automation: [],
  mixer: { volume: 0.8, pan: 0, mute: false, solo: false },
  color: '#6366f1',
};

const song: Song = SongSchema.parse({
  name: 'Round trip',
  tempos: [
    { tick: 0, bpm: 100 },
    { tick: 1920, bpm: 140.5 },
  ],
  timeSignatures: [
    { tick: 0, numerator: 4, denominator: 4 },
    { tick: 3840, numerator: 7, denominator: 8 },
  ],
  keySignatures: [{ tick: 0, key: 'D', scale: 'minor' }],
  meta: [{ tick: 0, type: 'marker', text: 'Verse' }],
  tracks: [
    {
      ...baseTrack,
      id: 't1',
      name: 'Piano',
      channel: 0,
      program: 4,
      notes: [
        { pitch: 60, startTick: 0, durationTicks: 480, velocity: 1 },
        { pitch: 64, startTick: 480, durationTicks: 240, velocity: 100 },
        { pitch: 67, startTick: 960, durationTicks: 1, velocity: 127 },
        ...Array.from({ length: 127 }, (_, i) => ({ pitch: i, startTick: 2000 + i, durationTicks: 10, velocity: i + 1 })),
      ],
      controlChanges: [
        { tick: 0, controller: 7, value: 100 },
        { tick: 480, controller: 7, value: 0 },
        { tick: 960, controller: 10, value: 64 },
        { tick: 960, controller: 64, value: 127 },
      ],
      pitchBends: [
        { tick: 100, value: -8192 },
        { tick: 200, value: 0 },
        { tick: 300, value: 4096 },
        { tick: 400, value: 8191 },
      ],
    },
    {
      ...baseTrack,
      id: 't2',
      name: 'Drums',
      channel: 9,
      program: 0,
      notes: [
        { pitch: 36, startTick: 0, durationTicks: 120, velocity: 110 },
        { pitch: 38, startTick: 480, durationTicks: 120, velocity: 90 },
      ],
    },
  ],
});

const byName = (s: Song, name: string) => s.tracks.find((t) => t.name === name)!;

describe('songToMidi / midiToSong (Phase 101 Theme B)', () => {
  it('round-trips notes, CC, pitch bend, the tempo map, signatures and meta', () => {
    const back = midiToSong(songToMidi(song));
    expect(back.name).toBe('Round trip');
    expect(back.tempos).toEqual(song.tempos);
    expect(back.timeSignatures).toEqual(song.timeSignatures);
    // The sidecar keeps key signatures; the .mid never gets the library's malformed ones.
    expect(back.keySignatures).toEqual([]);
    expect(back.meta).toEqual(song.meta);
    expect(back.tracks).toHaveLength(2);

    const piano = byName(back, 'Piano');
    expect(piano.channel).toBe(0);
    expect(piano.program).toBe(4);
    expect(piano.notes).toEqual([...byName(song, 'Piano').notes].sort((a, b) => a.startTick - b.startTick));
    expect(piano.controlChanges).toEqual(
      [...byName(song, 'Piano').controlChanges].sort((a, b) => a.tick - b.tick || a.controller - b.controller),
    );
    expect(piano.pitchBends).toEqual(byName(song, 'Piano').pitchBends);

    const drums = byName(back, 'Drums');
    expect(drums.channel).toBe(9);
    expect(drums.notes).toEqual(byName(song, 'Drums').notes);
  });

  it('writes a type-1 file with ppq 480 and a result that still validates', () => {
    const bytes = songToMidi(song);
    const header = new Midi(bytes);
    expect(header.header.ppq).toBe(480);
    expect(SongSchema.safeParse(midiToSong(bytes)).success).toBe(true);
  });

  it('opens a type-1 file from another resolution, rescaling ticks to 480 PPQ', () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    const t = midi.addTrack();
    t.name = 'Lead';
    t.addNote({ midi: 62, ticks: 480, durationTicks: 480, velocity: 0.5 });
    const bytes = songToMidi(midiToSong(midi.toArray()));
    expect(midiToSong(bytes).tracks[0]!.notes[0]).toMatchObject({ pitch: 62, startTick: 480, durationTicks: 480 });
  });

  it('opens a type-0 file, splitting channels into tracks', () => {
    // MThd type 0, 1 track, 96 ticks/beat; one track: tempo, program 40 on ch0, program 33 on ch1, two notes.
    const track = [
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 500000 µs = 120 bpm
      0x00, 0xc0, 40, // ch0 program 40
      0x00, 0xc1, 33, // ch1 program 33
      0x00, 0x90, 60, 100, // ch0 note on
      0x00, 0x91, 40, 90, // ch1 note on
      0x60, 0x80, 60, 0, // after 96 ticks, ch0 off
      0x00, 0x81, 40, 0, // ch1 off
      0x00, 0xff, 0x2f, 0x00,
    ];
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
    ]);
    const parsed = midiToSong(bytes, 'type0');
    expect(parsed.name).toBe('type0');
    expect(parsed.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(parsed.tracks).toHaveLength(2);
    const ch0 = parsed.tracks.find((tr) => tr.channel === 0)!;
    const ch1 = parsed.tracks.find((tr) => tr.channel === 1)!;
    expect(ch0.program).toBe(40);
    expect(ch1.program).toBe(33);
    // 96 ticks at 96 ppq is one beat; at 480 ppq it is 480.
    expect(ch0.notes).toEqual([{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 }]);
    expect(ch1.notes).toEqual([{ pitch: 40, startTick: 0, durationTicks: 480, velocity: 90 }]);
  });

  it('anchors a file with no tempo or signature at 120 BPM and 4/4', () => {
    const parsed = midiToSong(new Midi().toArray());
    expect(parsed.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(parsed.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
    expect(parsed.tracks).toEqual([]);
  });

  it('throws on bytes that are not a MIDI file', () => {
    expect(() => midiToSong(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
